import { addDays, format, subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  getPtoAwardById,
  getPtoAwardForDate,
  listLedgerEntriesForSource,
  replayBalance,
  updateTeamPolicy,
  upsertPtoCandidate,
  ValidationError,
} from '../database.js';
import {
  approvePtoAward,
  declinePtoAward,
  ensurePtoExpiryPosted,
  originatePtoAward,
  overridePtoExpiry,
} from '../engine/pto.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * §21, D-21, D-24. Nothing posts until approved (FR-7.1). Expiry piggybacks
 * on the same no-cron guard entitlement crediting already established
 * (D-12): no cron exists, so it posts the first time anything looks at a
 * date past it.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('engine/pto', () => {
  useTestDatabase();

  const aUser = async (policyOverrides = {}) => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      { ptoValidityDays: 30, ...policyOverrides },
      null,
      actor,
    );
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `EP-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
      },
      actor,
    );
  };

  const aCandidate = async (userId, date, rule, amount) =>
    upsertPtoCandidate(
      userId,
      date,
      { action: 'CREATE', patch: { status: 'PENDING', rule, amount } },
      actor,
    );

  /**
   * `approvePtoAward` and `ensurePtoExpiryPosted` both compare against the
   * REAL `new Date()` — a live business action, not an engine calculation
   * §23.5 forbids reading the clock in. Dates here are built relative to
   * "now" with `date-fns`, never hardcoded, so the tests stay correct
   * whatever day they happen to run on.
   */
  const daysAgo = (n) => format(subDays(new Date(), n), 'yyyy-MM-dd');

  describe('the one-live-candidate-per-date index', () => {
    it('lets a declined day be proposed again, which is the whole point of D-22', async () => {
      // The unique index is partial on `declined: false`. A decline that only
      // moves `status` leaves the row still occupying that slot, so the fresh
      // PENDING record D-22 requires collides at the index instead of being
      // written — the FR-7.8 lifecycle stops working at its second step.
      const user = await aUser();
      const userId = String(user._id);
      const first = await aCandidate(userId, '2026-08-15', 'BR-18', 0.5);

      await declinePtoAward(
        String(first._id),
        'Not owed after all',
        first.version,
        actor,
      );

      const second = await aCandidate(userId, '2026-08-15', 'BR-19', 1);

      expect(second.status).toBe('PENDING');
      expect(second.rule).toBe('BR-19');
      // The declined one is untouched — a decision is never destroyed (I-6).
      const declined = await getPtoAwardById(String(first._id));
      expect(declined.status).toBe('DECLINED');
    });
  });

  describe('approvePtoAward', () => {
    it('refuses a withdrawn candidate, whose day no longer qualifies (D-22)', async () => {
      // A withdrawal is not a decline — the record stays PENDING so a later
      // recalculation can revive it. That makes the status test alone
      // insufficient: without this guard a retracted suggestion could still be
      // approved and post an award for a day that no longer earns one.
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-19', 1);
      const withdrawn = await upsertPtoCandidate(
        userId,
        '2026-08-15',
        { action: 'UPDATE', patch: { withdrawn: true } },
        actor,
      );

      await expect(
        approvePtoAward(
          String(candidate._id),
          { amount: 1, reason: 'Approved anyway' },
          withdrawn.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
    });

    it('posts a signed-positive PTO_AWARD and the balance reflects it', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-19', 1);

      await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Confirmed with the team lead' },
        candidate.version,
        actor,
      );

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(1);

      const stored = await getPtoAwardForDate(userId, '2026-08-15');
      expect(stored.status).toBe('APPROVED');
      expect(stored.approvedAmount).toBe(1);
    });

    it('posts the changed amount, not the proposed one (FR-7.2)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-18', 0.5);

      // Unconstrained: OFFICE_ADMIN may approve a figure no ladder row
      // produces at all.
      await approvePtoAward(
        String(candidate._id),
        { amount: 1.5, reason: 'Extra time recognised beyond the ladder' },
        candidate.version,
        actor,
      );

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(1.5);
    });

    it('extends the expiry when approval happens after the original due date (FR-7.3)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      // Earned 40 days ago; the 30-day validity period is already behind us.
      const candidate = await aCandidate(userId, daysAgo(40), 'BR-19', 1);

      const approved = await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Approved late' },
        candidate.version,
        actor,
      );

      expect(approved.expiryExtended).toBe(true);
      // 30 days from TODAY, not from the (already-passed) natural date.
      expect(approved.expiresAt).toBe(
        format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      );
    });

    it('requires a reason', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      await expect(
        approvePtoAward(
          String(candidate._id),
          { amount: 1 },
          candidate.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses a stale write', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      await expect(
        approvePtoAward(
          String(candidate._id),
          { amount: 1, reason: 'x' },
          99,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'StaleWriteError' });
    });
  });

  describe('declinePtoAward', () => {
    it('posts nothing and the balance is unaffected', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-18', 0.5);

      await declinePtoAward(
        String(candidate._id),
        'Already compensated separately',
        candidate.version,
        actor,
      );

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
      // getPtoAwardForDate excludes DECLINED records by design (D-21) — a
      // declined record is read by its own id, not looked up by date.
      const stored = await getPtoAwardById(String(candidate._id));
      expect(stored.status).toBe('DECLINED');
      expect(stored.declinedSnapshot).toEqual({ rule: 'BR-18', amount: 0.5 });
    });

    it('requires a reason', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-18',
        0.5,
      );

      await expect(
        declinePtoAward(String(candidate._id), '', candidate.version, actor),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('originatePtoAward', () => {
    it('refuses a date that already has a live candidate, naming what is there', async () => {
      // FR-7.7 is explicitly "for a user and date the engine raised no
      // suggestion for". Without this the insert collides at the unique index
      // and a routine mistake surfaces as a driver error rather than an
      // answer the screen can show.
      const user = await aUser();
      const userId = String(user._id);
      await aCandidate(userId, '2026-08-15', 'BR-19', 1);

      await expect(
        originatePtoAward(
          {
            userId,
            date: '2026-08-15',
            amount: 1,
            reason: 'Site outage',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
    });

    it('creates an already-approved award with no prior candidate (FR-7.7)', async () => {
      const user = await aUser();
      const userId = String(user._id);

      const award = await originatePtoAward(
        {
          userId,
          date: '2026-08-15',
          amount: 1,
          reason: 'Worked the site outage with no punch record',
        },
        actor,
      );

      expect(award.status).toBe('APPROVED');
      expect(award.rule).toBe('MANUAL_GRANT');
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(1);
    });
  });

  describe('ensurePtoExpiryPosted', () => {
    it('posts PTO_EXPIRY for an award whose date has passed, and nothing for one that has not', async () => {
      const user = await aUser();
      const userId = String(user._id);

      // Earned exactly `ptoValidityDays` ago: the natural expiry lands on
      // today, so approval does NOT trigger FR-7.3's late-approval
      // extension (that only fires once the expiry date has strictly
      // passed) — this stays a genuine, not-yet-processed expiry for the
      // guard below to catch.
      const expired = await aCandidate(userId, daysAgo(30), 'BR-19', 1);
      await approvePtoAward(
        String(expired._id),
        { amount: 1, reason: 'Approved' },
        expired.version,
        actor,
      );

      const current = await aCandidate(userId, daysAgo(5), 'BR-18', 0.5);
      await approvePtoAward(
        String(current._id),
        { amount: 0.5, reason: 'Approved' },
        current.version,
        actor,
      );

      await ensurePtoExpiryPosted(userId, actor);

      expect(await replayBalance(userId, 'PTO', '2027-01-01')).toBe(0.5);
    });

    it('runs twice without posting PTO_EXPIRY a second time (I-9)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      // See the comment in the previous test: exactly `ptoValidityDays`
      // ago, so the natural expiry is today and approval doesn't extend it.
      const candidate = await aCandidate(userId, daysAgo(30), 'BR-19', 1);
      const approved = await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Approved' },
        candidate.version,
        actor,
      );

      await ensurePtoExpiryPosted(userId, actor);
      await ensurePtoExpiryPosted(userId, actor);

      const entries = await listLedgerEntriesForSource(
        'ptoAward',
        String(approved._id),
      );
      expect(
        entries.filter((entry) => entry.entryType === 'PTO_EXPIRY'),
      ).toHaveLength(1);
    });
  });

  describe('overridePtoExpiry', () => {
    it('reverses an already-posted expiry and restores the balance before the new date takes over', async () => {
      const user = await aUser();
      const userId = String(user._id);
      // Exactly `ptoValidityDays` ago — see the first `ensurePtoExpiryPosted`
      // test above for why this boundary matters.
      const earnedOn = daysAgo(30);
      const candidate = await aCandidate(userId, earnedOn, 'BR-19', 1);
      await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Approved' },
        candidate.version,
        actor,
      );
      await ensurePtoExpiryPosted(userId, actor);
      expect(await replayBalance(userId, 'PTO', '2027-01-01')).toBe(0);

      const current = await getPtoAwardForDate(userId, earnedOn);
      await overridePtoExpiry(
        String(current._id),
        { expiresAt: '2027-06-01', reason: 'Extended by agreement' },
        current.version,
        actor,
      );

      expect(await replayBalance(userId, 'PTO', '2027-01-01')).toBe(1);
    });
  });
});

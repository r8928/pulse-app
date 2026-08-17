import { format, subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  getCtoApplicationById,
  postLedgerEntries,
  postOpeningBalance,
  replayBalance,
  updateTeamPolicy,
  upsertCtoCandidate,
  upsertDayRecord,
  upsertPtoCandidate,
  ValidationError,
} from '../database.js';
import {
  approveCtoApplication,
  declineCtoApplication,
  originateCtoApplication,
} from '../engine/cto.js';
import { approvePtoAward } from '../engine/pto.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * §22, D-23. CTO has no balance of its own — it spends PTO. BR-26's
 * insufficient-balance block is a live check at approval time, not a queue
 * (D-23), so these tests exercise it directly against `replayBalance`
 * rather than against any stored "blocked" state.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('engine/cto', () => {
  useTestDatabase();

  const aUser = async (policyOverrides = {}) => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    if (Object.keys(policyOverrides).length > 0) {
      await updateTeamPolicy(String(team._id), policyOverrides, null, actor);
    }
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `EC-${String(codes++).padStart(3, '0')}`,
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
    upsertCtoCandidate(
      userId,
      date,
      { action: 'CREATE', patch: { status: 'PENDING', rule, amount } },
      actor,
    );

  /**
   * A day record with (or, at `deduction: 0`, without — `BR-25`) an
   * `AUTOMATIC_DEDUCTION` sourced from it, exactly as `recalculateOneDay`
   * would have posted it.
   */
  const aDay = async (userId, date, deduction) => {
    const { record } = await upsertDayRecord({
      userId,
      date,
      teamId: 'team-1',
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: {
        dayStatus: 'WFO',
        workedMinutes: 300,
        lateMinutes: 200,
        earlyMinutes: 0,
        deduction,
        deductionRule: 'BR-9:profileB:band1',
        isShortDay: true,
      },
      exceptions: [],
    });

    if (deduction > 0) {
      await postLedgerEntries(
        [
          {
            entryType: 'AUTOMATIC_DEDUCTION',
            leaveType: 'Casual',
            amount: -deduction,
            rule: 'BR-9:profileB:band1',
          },
        ],
        {
          sourceType: 'dayRecord',
          sourceId: String(record._id),
          sourceVersion: record.version,
          userId,
          date,
          actor,
          reason: null,
        },
      );
    }

    return record;
  };

  const givePto = async (userId, amount, date = '2026-01-01') =>
    postOpeningBalance(
      {
        userId,
        leaveType: 'PTO',
        amount,
        date,
        reason: 'Test fixture balance',
      },
      actor,
    );

  const daysAgo = (n) => format(subDays(new Date(), n), 'yyyy-MM-dd');

  describe('approveCtoApplication', () => {
    it('refuses a withdrawn candidate, whose day no longer qualifies (D-22)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);
      const withdrawn = await upsertCtoCandidate(
        userId,
        '2026-08-15',
        { action: 'UPDATE', patch: { withdrawn: true } },
        actor,
      );

      await expect(
        approveCtoApplication(
          String(candidate._id),
          { amount: 0.5, reason: 'Approved anyway' },
          withdrawn.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      // Neither movement posted: the deduction still stands, PTO untouched.
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(1);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-0.5);
    });

    it("posts the CTO_APPLIED debit and reverses that day's deduction when PTO is sufficient (§22.1)", async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      const approved = await approveCtoApplication(
        String(candidate._id),
        { amount: 0.5, reason: 'Confirmed lateness' },
        candidate.version,
        actor,
      );

      expect(approved.status).toBe('APPROVED');
      expect(approved.appliedAmount).toBe(0.5);
      expect(approved.blockOverridden).toBe(false);
      // PTO spent by the application...
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0.5);
      // ...and the day's own deduction reversed — never charged twice (§22.1).
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);
    });

    it('refuses when PTO is insufficient and no override is given, and posts nothing (BR-26)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      await expect(
        approveCtoApplication(
          String(candidate._id),
          { amount: 0.5, reason: 'Confirmed lateness' },
          candidate.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
      // The deduction stands — nothing reversed because nothing was approved.
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-0.5);
      const stored = await getCtoApplicationById(String(candidate._id));
      expect(stored.status).toBe('PENDING');
    });

    it('proceeds with an explicit override, marks blockOverridden, and is audited (BR-26, FR-6.10)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      const approved = await approveCtoApplication(
        String(candidate._id),
        { amount: 0.5, reason: 'Approved anyway', override: true },
        candidate.version,
        actor,
      );

      expect(approved.status).toBe('APPROVED');
      expect(approved.blockOverridden).toBe(true);
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(-0.5);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);
    });

    it('BR-25: applying CTO for a day with no deduction posted reverses nothing', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0); // did not attend at all — §22.2

      const candidate = await aCandidate(userId, '2026-08-15', 'BR-25', 1);

      const approved = await approveCtoApplication(
        String(candidate._id),
        { amount: 1, reason: 'Absent, CTO applied' },
        candidate.version,
        actor,
      );

      expect(approved.status).toBe('APPROVED');
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);
    });

    it('counts unexpired PTO only, sweeping an award whose expiry already passed before checking (§22.1)', async () => {
      const user = await aUser({ ptoValidityDays: 30 });
      const userId = String(user._id);

      // Earned exactly 30 days ago: naturally expires today, so approving it
      // does not trigger FR-7.3's late-approval extension — see
      // __tests__/engine.pto.test.js for why this boundary matters.
      const ptoCandidate = await upsertPtoCandidate(
        userId,
        daysAgo(30),
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );
      await approvePtoAward(
        String(ptoCandidate._id),
        { amount: 1, reason: 'Approved' },
        ptoCandidate.version,
        actor,
      );
      // Not swept yet: nothing has looked at a date past the expiry since
      // approval, so the PTO_AWARD credit is still sitting in the ledger.

      // The CTO application's own date must fall on or after the award's
      // expiry for this to matter at all — replayBalance "as of" a date
      // before the expiry would correctly exclude it regardless, since a
      // balance as of a past date is never affected by what happens later
      // (§21.3). Today is exactly the boundary (naturalExpiry === today).
      const today = daysAgo(0);
      await aDay(userId, today, 0.5);
      const candidate = await aCandidate(userId, today, 'BR-23', 0.5);

      // Naively summing the ledger would see the still-unswept award and
      // call 1 "available" — BR-26 requires the block anyway.
      await expect(
        approveCtoApplication(
          String(candidate._id),
          { amount: 0.5, reason: 'Confirmed lateness' },
          candidate.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('requires a reason', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      await expect(
        approveCtoApplication(
          String(candidate._id),
          { amount: 0.5 },
          candidate.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses a stale write', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      await expect(
        approveCtoApplication(
          String(candidate._id),
          { amount: 0.5, reason: 'x' },
          99,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'StaleWriteError' });
    });
  });

  describe('declineCtoApplication', () => {
    it('posts nothing and the balance is unaffected', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-22', 0.25);

      await declineCtoApplication(
        String(candidate._id),
        'Already compensated separately',
        candidate.version,
        actor,
      );

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
      const stored = await getCtoApplicationById(String(candidate._id));
      expect(stored.status).toBe('DECLINED');
      expect(stored.declinedSnapshot).toEqual({ rule: 'BR-22', amount: 0.25 });
    });

    it('requires a reason', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-22',
        0.25,
      );

      await expect(
        declineCtoApplication(
          String(candidate._id),
          '',
          candidate.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('originateCtoApplication', () => {
    it('refuses a date that already has a live candidate, as PTO does', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      await expect(
        originateCtoApplication(
          { userId, date: '2026-08-15', amount: 0.5, reason: 'By agreement' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(1);
    });

    it('lets a declined day be applied for again (D-22)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const first = await aCandidate(userId, '2026-08-15', 'BR-22', 0.25);

      await declineCtoApplication(
        String(first._id),
        'Lateness excused',
        first.version,
        actor,
      );

      const second = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      expect(second.status).toBe('PENDING');
      expect(second.rule).toBe('BR-23');
    });

    it('creates an already-approved application with no prior candidate, rule MANUAL_GRANT', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);

      const application = await originateCtoApplication(
        {
          userId,
          date: '2026-08-15',
          amount: 0.5,
          reason: 'Applied by agreement, system proposed nothing',
        },
        actor,
      );

      expect(application.status).toBe('APPROVED');
      expect(application.rule).toBe('MANUAL_GRANT');
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0.5);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);
    });

    it('succeeds even with insufficient PTO, honestly marking blockOverridden rather than blocking', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aDay(userId, '2026-08-15', 0.5);

      const application = await originateCtoApplication(
        {
          userId,
          date: '2026-08-15',
          amount: 0.5,
          reason: 'Applied by agreement, system proposed nothing',
        },
        actor,
      );

      expect(application.status).toBe('APPROVED');
      expect(application.blockOverridden).toBe(true);
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(-0.5);
    });
  });
});

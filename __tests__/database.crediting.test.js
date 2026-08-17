import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  listLedgerEntriesForUser,
  overrideEntitlement,
  postOpeningBalance,
  replayBalance,
  updateTeamPolicy,
  ValidationError,
} from '../database.js';
import { ensureEntitlementCredited } from '../engine/entitlement.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * ARCHITECTURE §20 and design record D-12.
 *
 * There is no cron or queue in this app (D-2 rejected one for recalculation on
 * the same reasoning), so a leave year credits itself the first time anything
 * looks at a date inside it. That makes idempotency the whole ballgame: the
 * guard runs constantly, and the second run must post nothing.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const year2026 = { start: '2026-01-01', end: '2026-12-31' };

let codes = 0;

describe('entitlement crediting', () => {
  useTestDatabase();

  const aUserOnATeam = async (leaveTypes, userOverrides = {}) => {
    const team = await createTeam({ name: `T${codes}` }, actor);

    if (leaveTypes) {
      await updateTeamPolicy(String(team._id), { leaveTypes }, null, actor);
    }

    const user = await createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `C-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2020-01-01',
        teamId: String(team._id),
        ...userOverrides,
      },
      actor,
    );

    return { team, user, userId: String(user._id) };
  };

  const standardTypes = [
    { name: 'Annual', annualEntitlement: 10 },
    { name: 'Sick', annualEntitlement: 10 },
    { name: 'Casual', annualEntitlement: 10 },
  ];

  describe('ensureEntitlementCredited', () => {
    it('credits the whole entitlement of every type for a full-year employee (BR-12)', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      const result = await ensureEntitlementCredited(userId, year2026, actor);

      expect(result.credited).toBe(3);
      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(10);
    });

    it('prorates a mid-year joiner from their tenure start (FR-2.7)', async () => {
      const { userId } = await aUserOnATeam(standardTypes, {
        dateOfJoining: '2026-07-01',
      });

      await ensureEntitlementCredited(userId, year2026, actor);

      // 184 of 365 days remain: 10 × 184/365 = 5.04, rounded to the half day.
      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(5);
    });

    it('credits nothing on a second call (I-9, NFR-15)', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      await ensureEntitlementCredited(userId, year2026, actor);
      const second = await ensureEntitlementCredited(userId, year2026, actor);

      expect(second.credited).toBe(0);
      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);
    });

    it('credits each leave year separately', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      await ensureEntitlementCredited(userId, year2026, actor);
      await ensureEntitlementCredited(
        userId,
        { start: '2027-01-01', end: '2027-12-31' },
        actor,
      );

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);
      expect(await replayBalance(userId, 'Annual', '2027-12-31')).toBe(20);
    });

    it('credits nothing where the team has configured no leave types (DC-6)', async () => {
      const { userId } = await aUserOnATeam(null);

      const result = await ensureEntitlementCredited(userId, year2026, actor);

      expect(result.credited).toBe(0);
    });

    it('credits a zero-entitlement type nothing, keeping it off the standard balance (FR-6.9)', async () => {
      const { userId } = await aUserOnATeam([
        { name: 'Annual', annualEntitlement: 10 },
        {
          name: 'Paternity',
          annualEntitlement: 0,
          consumesStandardBalance: false,
        },
      ]);

      await ensureEntitlementCredited(userId, year2026, actor);

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);
      expect(await replayBalance(userId, 'Paternity', '2026-12-31')).toBe(0);
    });

    it('credits nothing for a year that ended before the user joined', async () => {
      const { userId } = await aUserOnATeam(standardTypes, {
        dateOfJoining: '2027-03-01',
      });

      await ensureEntitlementCredited(userId, year2026, actor);

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(0);
    });
  });

  describe('postOpeningBalance', () => {
    it('posts the figure entered by hand at cutover (P-19, FR-6.13)', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      const entry = await postOpeningBalance(
        {
          userId,
          leaveType: 'Casual',
          amount: 4.5,
          date: '2026-01-01',
          reason: 'Carried from the 2025 workbook',
        },
        actor,
      );

      expect(entry.entryType).toBe('OPENING_BALANCE');
      expect(entry.amount).toBe(4.5);
      expect(entry.reason).toBe('Carried from the 2025 workbook');
      expect(entry.actorName).toBe('Office Administrator');
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(4.5);
    });

    it('requires a reason, because nothing computed it (FR-6.13)', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      await expect(
        postOpeningBalance(
          { userId, leaveType: 'Casual', amount: 4.5, date: '2026-01-01' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses a second opening balance for the same type', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      const opening = {
        userId,
        leaveType: 'Casual',
        amount: 4.5,
        date: '2026-01-01',
        reason: 'From the workbook',
      };

      await postOpeningBalance(opening, actor);

      await expect(postOpeningBalance(opening, actor)).rejects.toThrow(
        /already/i,
      );
    });

    it('accepts a negative opening balance, which the workbook can produce', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      await postOpeningBalance(
        {
          userId,
          leaveType: 'Casual',
          amount: -1.5,
          date: '2026-01-01',
          reason: 'Overdrawn at cutover',
        },
        actor,
      );

      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1.5);
    });
  });

  describe('overrideEntitlement', () => {
    it('reverses the credit and posts the corrected figure, leaving both visible (P-20)', async () => {
      const { userId } = await aUserOnATeam(standardTypes, {
        dateOfJoining: '2026-07-01',
      });
      await ensureEntitlementCredited(userId, year2026, actor);

      await overrideEntitlement(
        {
          userId,
          leaveType: 'Annual',
          leaveYear: year2026,
          amount: 10,
          reason: 'Offer letter promised the full entitlement',
        },
        actor,
      );

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);

      const entries = await listLedgerEntriesForUser(userId, {
        leaveType: 'Annual',
      });
      const types = entries.map((entry) => entry.entryType);

      // FR-6.8: the engine's own credit is still there, cancelled rather than
      // edited away.
      expect(types).toContain('ENTITLEMENT_CREDIT');
      expect(types).toContain('REVERSAL');
    });

    it('requires a reason', async () => {
      const { userId } = await aUserOnATeam(standardTypes);
      await ensureEntitlementCredited(userId, year2026, actor);

      await expect(
        overrideEntitlement(
          { userId, leaveType: 'Annual', leaveYear: year2026, amount: 12 },
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('posts the figure even where the engine credited nothing yet', async () => {
      const { userId } = await aUserOnATeam(standardTypes);

      await overrideEntitlement(
        {
          userId,
          leaveType: 'Annual',
          leaveYear: year2026,
          amount: 7,
          reason: 'Agreed separately',
        },
        actor,
      );

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(7);
    });
  });
});

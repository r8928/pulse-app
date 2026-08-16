import { describe, expect, it } from 'vitest';
import { HALF_DAY_PERIOD, ROLES } from '../constants/index.js';
import {
  cancelLeaveRecord,
  createLeaveRecord,
  createUser,
  getLeaveRecordsForUserDates,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * D-9 and D-16. A leave record is a genuine engine INPUT, read the way a
 * punch is — not an override of what the engine concluded. One per user per
 * date among live records, because two conflicting leave facts for one date
 * is not a real state.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codeCounter = 0;

const aUser = async () =>
  createUser(
    {
      fullName: 'Leave Taker',
      employeeCode: `L-9${String(codeCounter++).padStart(2, '0')}`,
      employmentType: 'PERMANENT',
      tracked: true,
      loginEnabled: true,
      role: ROLES.EMPLOYEE,
      dateOfJoining: '2025-01-01',
    },
    actor,
  );

const aLeave = async (userId, overrides = {}) =>
  createLeaveRecord(
    {
      userId,
      date: '2026-08-12',
      leaveType: 'Casual',
      amount: 1,
      reason: 'Family matter',
      ...overrides,
    },
    actor,
  );

describe('leave records', () => {
  useTestDatabase();

  describe('createLeaveRecord', () => {
    it('stores a full day of typed leave', async () => {
      const user = await aUser();
      const record = await aLeave(String(user._id));

      expect(record.amount).toBe(1);
      expect(record.halfDayPeriod).toBeNull();
      expect(record.leaveType).toBe('Casual');
      expect(record.actorName).toBe('Office Administrator');
    });

    it('stores a half day with the period it covers (D-11)', async () => {
      const user = await aUser();
      const record = await aLeave(String(user._id), {
        amount: 0.5,
        halfDayPeriod: HALF_DAY_PERIOD.AFTERNOON,
      });

      expect(record.amount).toBe(0.5);
      expect(record.halfDayPeriod).toBe('AFTERNOON');
    });

    it('requires a period on a half day, so the engine knows which half was worked', async () => {
      const user = await aUser();
      await expect(
        aLeave(String(user._id), { amount: 0.5 }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a period on a full day, which would be meaningless', async () => {
      const user = await aUser();
      await expect(
        aLeave(String(user._id), { halfDayPeriod: HALF_DAY_PERIOD.MORNING }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects an amount that is neither a full nor a half day', async () => {
      const user = await aUser();
      await expect(
        aLeave(String(user._id), { amount: 0.75 }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('requires a leave type (FR-6.2)', async () => {
      const user = await aUser();
      await expect(
        aLeave(String(user._id), { leaveType: '  ' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses a second live leave record for the same user and date, naming the clash', async () => {
      const user = await aUser();
      await aLeave(String(user._id));

      await expect(
        aLeave(String(user._id), { leaveType: 'Sick' }),
      ).rejects.toThrow(/already/i);
    });

    it('allows a new record on a date whose earlier one was cancelled', async () => {
      const user = await aUser();
      const first = await aLeave(String(user._id));
      await cancelLeaveRecord(
        String(first._id),
        'Cancelled by request',
        first.version,
        actor,
      );

      const second = await aLeave(String(user._id), { leaveType: 'Sick' });
      expect(second.leaveType).toBe('Sick');
    });

    it('does not stop two different users taking leave on the same date', async () => {
      const one = await aUser();
      const two = await aUser();
      await aLeave(String(one._id));
      await expect(aLeave(String(two._id))).resolves.toBeDefined();
    });
  });

  describe('getLeaveRecordsForUserDates', () => {
    it('returns only live records for the dates asked about', async () => {
      const user = await aUser();
      await aLeave(String(user._id));

      expect(
        await getLeaveRecordsForUserDates(String(user._id), ['2026-08-12']),
      ).toHaveLength(1);
      expect(
        await getLeaveRecordsForUserDates(String(user._id), ['2026-08-13']),
      ).toHaveLength(0);
    });

    it('excludes a cancelled record', async () => {
      const user = await aUser();
      const record = await aLeave(String(user._id));
      await cancelLeaveRecord(
        String(record._id),
        'Returned to work',
        record.version,
        actor,
      );

      expect(
        await getLeaveRecordsForUserDates(String(user._id), ['2026-08-12']),
      ).toHaveLength(0);
    });
  });

  describe('cancelLeaveRecord', () => {
    it('soft deletes rather than removing, so the history survives (I-1)', async () => {
      const user = await aUser();
      const record = await aLeave(String(user._id));

      const cancelled = await cancelLeaveRecord(
        String(record._id),
        'Returned to work',
        record.version,
        actor,
      );

      expect(cancelled.deletedAt).toBeInstanceOf(Date);
    });

    it('returns null for an id that does not exist', async () => {
      expect(
        await cancelLeaveRecord('64b7f9c2f1a2b3c4d5e6f7a8', 'Gone', 1, actor),
      ).toBeNull();
    });
  });
});

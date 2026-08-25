import { describe, expect, it } from 'vitest';
import { LEDGER_ENTRY_TYPE, RECORD_SOURCE, ROLES } from '../constants/index.js';
import {
  createLeaveRecord,
  createPunch,
  createTeam,
  createUser,
  listLeaveRecords,
  listLedgerEntriesForUsers,
  postLedgerEntries,
  setPunchDerivedFields,
  summarisePunchDays,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The three reads behind the day-by-day view on page 2.
 *
 * Each is deliberately many-users-at-once. The view shows a team over a month,
 * so a per-user call would be one round trip per colleague per screen — the
 * shape NFR-3 rules out before the roster is large enough to notice.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('day-by-day reads', () => {
  useTestDatabase();

  const aWorker = async () => {
    const team = await createTeam({ name: `D${codes++}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `D-${String(codes++).padStart(3, '0')}`,
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

  const aPunch = async (userId, at, type, workDate) => {
    const punch = await createPunch(
      { userId, at, type, source: 'FORM' },
      actor,
    );
    await setPunchDerivedFields(String(punch._id), {
      workDate,
      workDateExceptionCode: null,
      isDuplicate: false,
    });
    return punch;
  };

  describe('summarisePunchDays', () => {
    it('reports the first check-in and the last check-out of a work date', async () => {
      const user = await aWorker();
      const userId = String(user._id);

      await aPunch(userId, '2026-08-12T09:12:00Z', 'CHECK_IN', '2026-08-12');
      await aPunch(userId, '2026-08-12T13:00:00Z', 'CHECK_OUT', '2026-08-12');
      await aPunch(userId, '2026-08-12T14:00:00Z', 'CHECK_IN', '2026-08-12');
      await aPunch(userId, '2026-08-12T18:04:00Z', 'CHECK_OUT', '2026-08-12');

      const [day] = await summarisePunchDays({
        userIds: [userId],
        from: '2026-08-01',
        to: '2026-08-31',
      });

      // A lunch break is two pairs; the column is the day's bookends, so the
      // middle two punches move neither figure.
      expect(day.checkIn.toISOString()).toBe('2026-08-12T09:12:00.000Z');
      expect(day.checkOut.toISOString()).toBe('2026-08-12T18:04:00.000Z');
    });

    it('reports a check-in with no check-out rather than dropping the day', async () => {
      const user = await aWorker();
      const userId = String(user._id);

      await aPunch(userId, '2026-08-12T09:00:00Z', 'CHECK_IN', '2026-08-12');

      const [day] = await summarisePunchDays({
        userIds: [userId],
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(day.checkIn).toBeTruthy();
      expect(day.checkOut).toBeNull();
    });

    it('leaves out punches the engine has not dated yet', async () => {
      const user = await aWorker();
      const userId = String(user._id);

      await createPunch(
        {
          userId,
          at: '2026-08-12T09:00:00Z',
          type: 'CHECK_IN',
          source: 'FORM',
        },
        actor,
      );

      expect(
        await summarisePunchDays({
          userIds: [userId],
          from: '2026-08-01',
          to: '2026-08-31',
        }),
      ).toEqual([]);
    });

    it('keeps each colleague and each date apart', async () => {
      const one = await aWorker();
      const two = await aWorker();

      await aPunch(
        String(one._id),
        '2026-08-12T09:00:00Z',
        'CHECK_IN',
        '2026-08-12',
      );
      await aPunch(
        String(one._id),
        '2026-08-13T09:00:00Z',
        'CHECK_IN',
        '2026-08-13',
      );
      await aPunch(
        String(two._id),
        '2026-08-12T10:00:00Z',
        'CHECK_IN',
        '2026-08-12',
      );

      const days = await summarisePunchDays({
        userIds: [String(one._id), String(two._id)],
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(days).toHaveLength(3);
      expect(
        days.filter((day) => day.userId === String(one._id)).map((d) => d.date),
      ).toEqual(['2026-08-12', '2026-08-13']);
    });

    it('returns nothing for a range with no punches rather than throwing', async () => {
      expect(
        await summarisePunchDays({
          userIds: ['nobody'],
          from: '2030-01-01',
          to: '2030-01-31',
        }),
      ).toEqual([]);
    });
  });

  describe('listLeaveRecords', () => {
    it('reads every colleague’s leave inside the range in one call', async () => {
      const one = await aWorker();
      const two = await aWorker();

      await createLeaveRecord(
        {
          userId: String(one._id),
          date: '2026-08-12',
          leaveType: 'Annual',
          amount: 1,
          reason: 'Away',
        },
        actor,
      );
      await createLeaveRecord(
        {
          userId: String(two._id),
          date: '2026-08-13',
          leaveType: 'Sick',
          amount: 0.5,
          halfDayPeriod: 'MORNING',
          reason: 'Unwell',
        },
        actor,
      );
      await createLeaveRecord(
        {
          userId: String(one._id),
          date: '2026-09-01',
          leaveType: 'Annual',
          amount: 1,
          reason: 'Outside the range',
        },
        actor,
      );

      const records = await listLeaveRecords({
        userIds: [String(one._id), String(two._id)],
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(records.map((record) => record.date)).toEqual([
        '2026-08-12',
        '2026-08-13',
      ]);
      expect(records[1].amount).toBe(0.5);
    });

    it('returns nothing for a range with no leave rather than throwing', async () => {
      expect(
        await listLeaveRecords({
          userIds: ['nobody'],
          from: '2030-01-01',
          to: '2030-01-31',
        }),
      ).toEqual([]);
    });
  });

  describe('listLedgerEntriesForUsers', () => {
    it('reads every entry up to the closing date, oldest first', async () => {
      const user = await aWorker();
      const userId = String(user._id);

      let source = 0;
      for (const [date, amount, entryType] of [
        ['2026-08-20', -1, LEDGER_ENTRY_TYPE.LEAVE_AVAILED],
        ['2026-08-01', 12, LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT],
        ['2026-09-05', 1, LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT],
      ]) {
        await postLedgerEntries(
          [{ entryType, leaveType: 'Annual', amount, rule: 'Test' }],
          {
            sourceType: RECORD_SOURCE.LEAVE_RECORD,
            sourceId: `source-${source++}`,
            sourceVersion: 1,
            userId,
            date,
            actor,
          },
        );
      }

      const entries = await listLedgerEntriesForUsers({
        userIds: [userId],
        to: '2026-08-31',
      });

      // Oldest first, because the caller accumulates a running balance in
      // exactly this order and a different order would produce a different
      // number for the same day.
      expect(entries.map((entry) => entry.date)).toEqual([
        '2026-08-01',
        '2026-08-20',
      ]);
    });

    it('returns nothing for a colleague with no ledger rather than throwing', async () => {
      expect(
        await listLedgerEntriesForUsers({
          userIds: ['nobody'],
          to: '2030-01-31',
        }),
      ).toEqual([]);
    });
  });
});

import { addDays, format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  EXCEPTION_CODE,
  EXCEPTION_QUEUE,
  RECORD_SOURCE,
  REDUCTION_CHANGE,
  ROLES,
} from '../constants/index.js';
import {
  createPunch,
  createShift,
  createTeam,
  createUser,
  postLedgerEntries,
  postOpeningBalance,
  recordImportExceptions,
  setDayOverride,
  setPunchDerivedFields,
  setWeeklyOffPattern,
  softDeleteUser,
  updateTeamPolicy,
  upsertCtoCandidate,
  upsertDayRecord,
  upsertPtoCandidate,
} from '../database.js';
import {
  countExceptionQueues,
  listExceptionQueue,
} from '../engine/exceptions.js';
import { approvePtoAward } from '../engine/pto.js';
import { checkReduction } from '../engine/reduction.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `FR-8.6` and §27.1's twelve queues.
 *
 * §27.2's rule shapes all of this: **derive, do not accumulate.** A day-level
 * exception is a conclusion about current state, read live from
 * `dayRecord.exceptions` — so fixing the punch clears the queue with no
 * separate cleanup step, and that self-healing is what these assert.
 *
 * Every queue answers `{ items, total }` so `S-05` can render twelve tabs
 * through one shape, and every one of them pages (`NFR-3`, `DC-10`).
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const range = { from: '2026-01-01', to: '2026-12-31' };

let codes = 0;

describe('engine/exceptions', () => {
  useTestDatabase();

  const aTeam = async (policy = {}) => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const teamId = String(team._id);

    await createShift(
      {
        teamId,
        name: 'General',
        startTime: '09:00',
        endTime: '18:00',
        timezone: 'Asia/Karachi',
        requiredDailyMinutes: 540,
        graceMinutes: 15,
      },
      actor,
    );
    await setWeeklyOffPattern(teamId, { daysOfWeek: [0, 6] }, null, actor);
    await updateTeamPolicy(teamId, policy, null, actor);

    return team;
  };

  const aUser = async (teamId) =>
    createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `EX-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId,
      },
      actor,
    );

  const aDay = async (
    userId,
    date,
    { exceptions = [], computed = {} } = {},
  ) => {
    const { record } = await upsertDayRecord({
      userId,
      date,
      teamId: 'team-1',
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: {
        dayStatus: 'WFO',
        workedMinutes: 540,
        lateMinutes: 0,
        earlyMinutes: 0,
        deduction: 0,
        deductionRule: null,
        isShortDay: false,
        ...computed,
      },
      exceptions,
    });
    return record;
  };

  const today = () => format(new Date(), 'yyyy-MM-dd');
  const inDays = (n) => format(addDays(new Date(), n), 'yyyy-MM-dd');

  describe('missing check in or check out (FR-4.8)', () => {
    it('queues the day that raised it and names the person', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);
      await aDay(userId, '2026-08-12', {
        exceptions: [EXCEPTION_CODE.MISSING_CHECK_OUT],
      });

      const { items, total } = await listExceptionQueue(
        EXCEPTION_QUEUE.MISSING_PUNCH,
        range,
      );

      expect(total).toBe(1);
      expect(items[0].userName).toBe(user.fullName);
      expect(items[0].date).toBe('2026-08-12');
    });

    it('clears itself when the day is recomputed without the exception (§27.2)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);
      await aDay(userId, '2026-08-12', {
        exceptions: [EXCEPTION_CODE.MISSING_CHECK_IN],
      });
      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.MISSING_PUNCH, range)).total,
      ).toBe(1);

      // The punch is added and the day recomputed. Nothing "resolves" a queue
      // entry — it stops being true, which is the whole point of §27.2.
      await aDay(userId, '2026-08-12', { exceptions: [] });

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.MISSING_PUNCH, range)).total,
      ).toBe(0);
    });
  });

  describe('impossible duration and no shift assigned', () => {
    it('keeps each code in its own queue rather than pooling them', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      await aDay(userId, '2026-08-12', {
        exceptions: [EXCEPTION_CODE.IMPOSSIBLE_DURATION],
      });
      await aDay(userId, '2026-08-13', {
        exceptions: [EXCEPTION_CODE.NO_SHIFT_ASSIGNED],
      });

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.IMPOSSIBLE_DURATION, range))
          .total,
      ).toBe(1);
      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.NO_SHIFT, range)).total,
      ).toBe(1);
      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.MISSING_PUNCH, range)).total,
      ).toBe(0);
    });
  });

  describe('duplicate punch (FR-4.7)', () => {
    it('queues a flagged punch and drops it once it is resolved', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      const punch = await createPunch(
        {
          userId,
          at: '2026-08-12T04:00:00.000Z',
          type: 'CHECK_IN',
          source: 'IMPORT',
        },
        actor,
      );
      await setPunchDerivedFields(String(punch._id), {
        workDate: '2026-08-12',
        workDateExceptionCode: null,
        isDuplicate: true,
      });

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.DUPLICATE_PUNCH, range))
          .total,
      ).toBe(1);

      // P-07 keeps it: the flag comes off and the queue empties.
      await setPunchDerivedFields(String(punch._id), {
        workDate: '2026-08-12',
        workDateExceptionCode: null,
        isDuplicate: false,
      });

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.DUPLICATE_PUNCH, range))
          .total,
      ).toBe(0);
    });
  });

  describe('required configuration not set (FR-3.13)', () => {
    it('queues one row per outstanding field, naming the entity', async () => {
      // A team with no policy at all: every REQUIRED_POLICY_FIELD is missing.
      await createTeam({ name: `Bare ${codes++}` }, actor);

      const { items, total } = await listExceptionQueue(
        EXCEPTION_QUEUE.CONFIGURATION,
        range,
      );

      expect(total).toBeGreaterThan(0);
      expect(items[0].entity).toBeTruthy();
      expect(items[0].field).toBeTruthy();
      expect(items[0].why).toBeTruthy();
    });
  });

  describe('unmatched import row (FR-4.4, D-26)', () => {
    it('queues the unresolved ones only', async () => {
      await recordImportExceptions(
        [
          {
            sheetRow: 2,
            employeeCode: 'X-1',
            fullName: 'A',
            reason: 'No code',
          },
          {
            sheetRow: 3,
            employeeCode: 'X-2',
            fullName: 'B',
            reason: 'No user',
          },
        ],
        actor,
      );

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.IMPORT_ROW, range)).total,
      ).toBe(2);
    });
  });

  describe('unresolved late arrival (FR-6.10)', () => {
    it('queues a late day that cost leave and nobody has waived', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      await aDay(userId, '2026-08-12', {
        computed: { lateMinutes: 90, deduction: 0.25, deductionRule: 'BR-9' },
      });

      const { items, total } = await listExceptionQueue(
        EXCEPTION_QUEUE.LATE_ARRIVAL,
        range,
      );

      expect(total).toBe(1);
      expect(items[0].lateMinutes).toBe(90);
      expect(items[0].deduction).toBe(0.25);
    });

    it('does not queue a late day nobody was charged for', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));

      await aDay(String(user._id), '2026-08-12', {
        computed: { lateMinutes: 5, deduction: 0, deductionRule: null },
      });

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.LATE_ARRIVAL, range)).total,
      ).toBe(0);
    });

    it('drops out once the deduction is waived (P-25, FR-6.11)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);
      const record = await aDay(userId, '2026-08-12', {
        computed: { lateMinutes: 90, deduction: 0.25, deductionRule: 'BR-9' },
      });

      await setDayOverride(
        userId,
        '2026-08-12',
        { deduction: 0, reason: 'Approved lateness' },
        record.version,
        actor,
      );

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.LATE_ARRIVAL, range)).total,
      ).toBe(0);
    });
  });

  describe('exhausted leave or PTO balance (FR-8.6)', () => {
    it('queues a balance that has gone below zero, naming the type', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      const record = await aDay(userId, '2026-08-12', {
        computed: { deduction: 1, deductionRule: 'BR-10' },
      });
      await postLedgerEntries(
        [
          {
            entryType: 'AUTOMATIC_DEDUCTION',
            leaveType: 'Casual',
            amount: -1,
            rule: 'BR-10',
          },
        ],
        {
          sourceType: RECORD_SOURCE.DAY_RECORD,
          sourceId: String(record._id),
          sourceVersion: record.version,
          userId,
          date: '2026-08-12',
          actor,
          reason: null,
        },
      );

      const { items, total } = await listExceptionQueue(
        EXCEPTION_QUEUE.EXHAUSTED_BALANCE,
        range,
      );

      expect(total).toBe(1);
      expect(items[0].leaveType).toBe('Casual');
      expect(items[0].balance).toBe(-1);
    });

    it('leaves a healthy balance alone', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));

      await postOpeningBalance(
        {
          userId: String(user._id),
          leaveType: 'Casual',
          amount: 5,
          date: '2026-01-01',
          reason: 'Cutover',
        },
        actor,
      );

      expect(
        (await listExceptionQueue(EXCEPTION_QUEUE.EXHAUSTED_BALANCE, range))
          .total,
      ).toBe(0);
    });
  });

  describe('PTO approaching expiry (FR-7.4, D-27)', () => {
    it('queues an approved award expiring inside the warning window', async () => {
      const team = await aTeam({
        ptoValidityDays: 30,
        ptoExpiryWarningDays: 7,
      });
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      // Earned 27 days ago: expires in 3 days, inside a 7-day window.
      const candidate = await upsertPtoCandidate(
        userId,
        format(addDays(new Date(), -27), 'yyyy-MM-dd'),
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );
      await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Approved' },
        candidate.version,
        actor,
      );

      const { items, total } = await listExceptionQueue(
        EXCEPTION_QUEUE.PTO_EXPIRING,
        { from: '2020-01-01', to: inDays(365) },
      );

      expect(total).toBe(1);
      expect(items[0].expiresAt).toBeTruthy();
    });

    it('leaves an award alone while its expiry is beyond the window', async () => {
      const team = await aTeam({
        ptoValidityDays: 30,
        ptoExpiryWarningDays: 7,
      });
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      const candidate = await upsertPtoCandidate(
        userId,
        today(),
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );
      await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Approved' },
        candidate.version,
        actor,
      );

      expect(
        (
          await listExceptionQueue(EXCEPTION_QUEUE.PTO_EXPIRING, {
            from: '2020-01-01',
            to: inDays(365),
          })
        ).total,
      ).toBe(0);
    });
  });

  describe('PTO and CTO awaiting approval', () => {
    it('queues each pending candidate with the rule that suggests it', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );
      await upsertCtoCandidate(
        userId,
        '2026-08-13',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-23', amount: 0.5 },
        },
        actor,
      );

      const pto = await listExceptionQueue(EXCEPTION_QUEUE.PTO_PENDING, range);
      const cto = await listExceptionQueue(EXCEPTION_QUEUE.CTO_PENDING, range);

      expect(pto.total).toBe(1);
      expect(pto.items[0].rule).toBe('BR-19');
      expect(cto.total).toBe(1);
      expect(cto.items[0].rule).toBe('BR-23');
    });
  });

  describe('employment-period reduction (FR-2.11)', () => {
    it('queues what is awaiting a decision', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);
      await aDay(userId, '2026-08-12');

      await softDeleteUser(
        userId,
        { dateOfLeaving: '2026-08-04', reason: 'Resigned' },
        actor,
        user.version,
      );
      await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      const { items, total } = await listExceptionQueue(
        EXCEPTION_QUEUE.REDUCTION,
        range,
      );

      expect(total).toBe(1);
      expect(items[0].userName).toBe(user.fullName);
      expect(items[0].records).toHaveLength(1);
    });
  });

  describe('countExceptionQueues', () => {
    it('answers a count for every one of the twelve, present or zero', async () => {
      const counts = await countExceptionQueues(range);

      expect(Object.keys(counts).sort()).toEqual(
        Object.values(EXCEPTION_QUEUE).sort(),
      );
      expect(
        Object.values(counts).every((count) => typeof count === 'number'),
      ).toBe(true);
    });

    it('counts what the queue itself would list', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      await aDay(String(user._id), '2026-08-12', {
        exceptions: [EXCEPTION_CODE.MISSING_CHECK_IN],
      });

      const counts = await countExceptionQueues(range);
      const listed = await listExceptionQueue(
        EXCEPTION_QUEUE.MISSING_PUNCH,
        range,
      );

      expect(counts[EXCEPTION_QUEUE.MISSING_PUNCH]).toBe(listed.total);
    });
  });

  describe('paging', () => {
    it('returns a page and the full total, never the whole backlog (NFR-3)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      for (let day = 10; day < 15; day++) {
        await aDay(userId, `2026-08-${day}`, {
          exceptions: [EXCEPTION_CODE.MISSING_CHECK_IN],
        });
      }

      const page = await listExceptionQueue(EXCEPTION_QUEUE.MISSING_PUNCH, {
        ...range,
        page: 2,
        pageSize: 2,
      });

      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(5);
    });
  });

  describe('an unknown queue', () => {
    it('answers empty rather than throwing, so one bad tab cannot blank S-05', async () => {
      expect(await listExceptionQueue('NOT_A_QUEUE', range)).toEqual({
        items: [],
        total: 0,
      });
    });
  });
});

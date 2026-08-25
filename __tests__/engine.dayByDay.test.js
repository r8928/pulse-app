import { describe, expect, it } from 'vitest';
import { LEDGER_ENTRY_TYPE, RECORD_SOURCE, ROLES } from '../constants/index.js';
import {
  createLeaveRecord,
  createPunch,
  createShift,
  createTeam,
  createUser,
  postLedgerEntries,
  postOpeningBalance,
  setPunchDerivedFields,
  setWeeklyOffPattern,
  softDeleteUser,
  updateTeamPolicy,
  upsertDayRecord,
} from '../database.js';
import { buildDayByDay } from '../engine/dayByDay.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * Page 2's day-by-day view: one row per colleague per date, in the shape of
 * the workbook it replaces.
 *
 * The thing that makes it worth building rather than reading the grid one date
 * at a time is that it is CONTINUOUS — every date in the range is present,
 * including the ones nobody touched. A view that only shows dates with records
 * cannot show a gap, and a gap is the thing a reader is looking for.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('engine/dayByDay', () => {
  useTestDatabase();

  const aTeam = async () => {
    const team = await createTeam({ name: `DB${codes++}` }, actor);
    const teamId = String(team._id);

    const shift = await createShift(
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
    await updateTeamPolicy(teamId, {}, null, actor);

    return { teamId, shiftId: String(shift._id) };
  };

  const aUser = async (teamId, overrides = {}) =>
    createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `DB-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId,
        ...overrides,
      },
      actor,
    );

  const aDay = (userId, teamId, shiftId, date, computed = {}) =>
    upsertDayRecord({
      userId,
      date,
      teamId,
      shiftId,
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
      exceptions: [],
    });

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
  };

  const range = { from: '2026-08-10', to: '2026-08-14' };

  it('gives every date in the range a row, touched or not', async () => {
    const { teamId, shiftId } = await aTeam();
    const user = await aUser(teamId);
    await aDay(String(user._id), teamId, shiftId, '2026-08-12');

    const [person] = await buildDayByDay({
      userIds: [String(user._id)],
      ...range,
    });

    expect(person.days).toHaveLength(5);
    expect(person.days.map((day) => day.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ]);
  });

  it('names the weekday beside the date, as the workbook does', async () => {
    const { teamId } = await aTeam();
    const user = await aUser(teamId);

    const [person] = await buildDayByDay({
      userIds: [String(user._id)],
      ...range,
    });

    expect(person.days[0].weekday).toBe('Monday');
    expect(person.days[4].weekday).toBe('Friday');
  });

  it('reports the arrival, the departure and the hours worked', async () => {
    const { teamId, shiftId } = await aTeam();
    const user = await aUser(teamId);
    const userId = String(user._id);

    await aDay(userId, teamId, shiftId, '2026-08-12', { workedMinutes: 532 });
    await aPunch(userId, '2026-08-12T09:12:00Z', 'CHECK_IN', '2026-08-12');
    await aPunch(userId, '2026-08-12T18:04:00Z', 'CHECK_OUT', '2026-08-12');

    const [person] = await buildDayByDay({ userIds: [userId], ...range });
    const day = person.days.find((entry) => entry.date === '2026-08-12');

    expect(day.checkIn).toBe('2026-08-12T09:12:00.000Z');
    expect(day.checkOut).toBe('2026-08-12T18:04:00.000Z');
    expect(day.workedMinutes).toBe(532);
  });

  it('reports the corrected duration where a human corrected it', async () => {
    const { teamId, shiftId } = await aTeam();
    const user = await aUser(teamId);
    const userId = String(user._id);

    const { record } = await aDay(userId, teamId, shiftId, '2026-08-12', {
      workedMinutes: 60,
    });
    const { setDayOverride } = await import('../database.js');
    await setDayOverride(
      userId,
      '2026-08-12',
      { workedMinutes: 540, reason: 'Terminal missed the morning punch' },
      record.version,
      actor,
    );

    const [person] = await buildDayByDay({ userIds: [userId], ...range });
    const day = person.days.find((entry) => entry.date === '2026-08-12');

    expect(day.workedMinutes).toBe(540);
  });

  it('shows the leave taken on a date and the balance it left behind', async () => {
    const { teamId } = await aTeam();
    const user = await aUser(teamId);
    const userId = String(user._id);

    await postOpeningBalance(
      {
        userId,
        leaveType: 'Annual',
        amount: 12,
        date: '2026-01-01',
        reason: 'Cutover',
      },
      actor,
    );
    await createLeaveRecord(
      {
        userId,
        date: '2026-08-12',
        leaveType: 'Annual',
        amount: 1,
        reason: 'Away',
      },
      actor,
    );
    await postLedgerEntries(
      [
        {
          entryType: LEDGER_ENTRY_TYPE.LEAVE_AVAILED,
          leaveType: 'Annual',
          amount: -1,
          rule: 'BR-11',
        },
      ],
      {
        sourceType: RECORD_SOURCE.LEAVE_RECORD,
        sourceId: 'leave-1',
        sourceVersion: 1,
        userId,
        date: '2026-08-12',
        actor,
      },
    );

    const [person] = await buildDayByDay({ userIds: [userId], ...range });
    const before = person.days.find((day) => day.date === '2026-08-11');
    const on = person.days.find((day) => day.date === '2026-08-12');

    expect(before.leaveBalance).toBe(12);
    expect(on.leaveUsed).toBe(1);
    // The running balance is the balance AFTER that date's movements, so the
    // number a reader checks sits on the row that caused it to change.
    expect(on.leaveBalance).toBe(11);
  });

  it('shows what was awarded on the date it was awarded', async () => {
    const { teamId } = await aTeam();
    const user = await aUser(teamId);
    const userId = String(user._id);

    await postLedgerEntries(
      [
        {
          entryType: LEDGER_ENTRY_TYPE.CTO_APPLIED,
          leaveType: 'Annual',
          amount: 1,
          rule: 'FR-7.4',
        },
      ],
      {
        sourceType: RECORD_SOURCE.CTO_APPLICATION,
        sourceId: 'cto-1',
        sourceVersion: 1,
        userId,
        date: '2026-08-13',
        actor,
      },
    );

    const [person] = await buildDayByDay({ userIds: [userId], ...range });

    expect(
      person.days.find((day) => day.date === '2026-08-13').leaveAwarded,
    ).toBe(1);
    expect(
      person.days.find((day) => day.date === '2026-08-12').leaveAwarded,
    ).toBe(0);
  });

  it('carries a balance from before the range into its first row', async () => {
    const { teamId } = await aTeam();
    const user = await aUser(teamId);
    const userId = String(user._id);

    await postOpeningBalance(
      {
        userId,
        leaveType: 'Annual',
        amount: 9,
        date: '2026-01-01',
        reason: 'Cutover',
      },
      actor,
    );

    const [person] = await buildDayByDay({ userIds: [userId], ...range });

    // A balance is everything up to a date, not a slice of the range (§19.2).
    expect(person.days[0].leaveBalance).toBe(9);
  });

  it('marks a date outside the employment period rather than calling it absence', async () => {
    const { teamId } = await aTeam();
    const user = await aUser(teamId);
    const userId = String(user._id);

    await softDeleteUser(
      userId,
      { dateOfLeaving: '2026-08-11', reason: 'Resigned' },
      actor,
      user.version,
    );

    const [person] = await buildDayByDay({ userIds: [userId], ...range });

    expect(person.days[0].inEmploymentPeriod).toBe(true);
    // Defect F1's lesson: not employed is a different thing from not present.
    expect(person.days[4].inEmploymentPeriod).toBe(false);
  });

  it('keeps colleagues in roster order, each with their own block', async () => {
    const { teamId } = await aTeam();
    const zoe = await aUser(teamId, { fullName: 'Zoe Last' });
    const adam = await aUser(teamId, { fullName: 'Adam First' });

    const people = await buildDayByDay({
      userIds: [String(zoe._id), String(adam._id)],
      ...range,
    });

    expect(people.map((person) => person.fullName)).toEqual([
      'Adam First',
      'Zoe Last',
    ]);
    expect(people[0].employeeCode).toBe(adam.employeeCode);
  });

  it('returns nothing when asked for nobody rather than throwing', async () => {
    expect(await buildDayByDay({ userIds: [], ...range })).toEqual([]);
  });
});

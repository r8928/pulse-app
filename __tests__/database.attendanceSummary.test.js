import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  softDeleteUser,
  summariseAttendance,
  upsertDayRecord,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * S-09. FR-5.6 and FR-5.7: the statistics behind the overview.
 *
 * Every total reads the EFFECTIVE value, so an administrator's decision counts
 * exactly as the engine's own conclusion would (FR-6.11) — a figure computed
 * one way here and another way on S-10 is the drift NFR-8 exists to prevent.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

const computed = (overrides = {}) => ({
  dayStatus: 'WFO',
  workedMinutes: 540,
  lateMinutes: 0,
  earlyMinutes: 0,
  deduction: 0,
  deductionRule: null,
  isShortDay: false,
  isCompliant: true,
  ...overrides,
});

describe('summariseAttendance', () => {
  useTestDatabase();

  const aUser = async (teamId, overrides = {}) =>
    createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `S-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId,
        ...overrides,
      },
      actor,
    );

  const aDay = (userId, teamId, date, computedValues, override = null) =>
    upsertDayRecord({
      userId,
      date,
      teamId,
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: computed(computedValues),
      exceptions: [],
    }).then(async ({ record }) => {
      if (override) {
        const { setDayOverride } = await import('../database.js');
        await setDayOverride(userId, date, override, record.version, actor);
      }
      return record;
    });

  const range = { from: '2026-08-01', to: '2026-08-31' };

  it('totals each status into its own column', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(userId, String(team._id), '2026-08-12', {});
    await aDay(userId, String(team._id), '2026-08-13', { dayStatus: 'ABSENT' });
    await aDay(userId, String(team._id), '2026-08-14', { dayStatus: 'WFH' });

    const { rows } = await summariseAttendance(range);
    const row = rows.find((entry) => entry.userId === userId);

    // A day worked from home is present AND counts against the WFH quota —
    // the alternative would read a week worked from home as a week of nothing.
    expect(row.present).toBe(2);
    expect(row.absent).toBe(1);
    expect(row.wfh).toBe(1);
  });

  it('counts a late day once, however late it was', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(userId, String(team._id), '2026-08-12', { lateMinutes: 5 });
    await aDay(userId, String(team._id), '2026-08-13', { lateMinutes: 240 });
    await aDay(userId, String(team._id), '2026-08-14', { lateMinutes: 0 });

    const { rows } = await summariseAttendance(range);
    expect(rows.find((entry) => entry.userId === userId).lateDays).toBe(2);
  });

  it('counts short days and holiday work separately', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(userId, String(team._id), '2026-08-12', { isShortDay: true });
    await aDay(userId, String(team._id), '2026-08-13', {
      dayStatus: 'HOLIDAY_WORK',
      countsAsHolidayWork: true,
    });
    // BR-27: below the threshold it is still HOLIDAY_WORK and still shown,
    // but it is not counted in the FR-5.6 report.
    await aDay(userId, String(team._id), '2026-08-14', {
      dayStatus: 'HOLIDAY_WORK',
      countsAsHolidayWork: false,
    });

    const { rows } = await summariseAttendance(range);
    const row = rows.find((entry) => entry.userId === userId);

    expect(row.shortDays).toBe(1);
    expect(row.holidayWork).toBe(1);
  });

  it('counts an overridden status as the override, not the engine value (FR-6.11)', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(
      userId,
      String(team._id),
      '2026-08-12',
      { dayStatus: 'ABSENT' },
      { dayStatus: 'WFH', reason: 'Approved, terminal was down' },
    );

    const { rows } = await summariseAttendance(range);
    const row = rows.find((entry) => entry.userId === userId);

    expect(row.wfh).toBe(1);
    expect(row.absent).toBe(0);
  });

  it('breaks leave down by type rather than lumping it together (FR-5.7)', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    const { createLeaveRecord } = await import('../database.js');
    for (const [date, leaveType] of [
      ['2026-08-12', 'Casual'],
      ['2026-08-13', 'Casual'],
      ['2026-08-14', 'Sick'],
    ]) {
      await createLeaveRecord(
        { userId, date, leaveType, amount: 1, reason: 'Out' },
        actor,
      );
      await aDay(userId, String(team._id), date, { dayStatus: 'LEAVE' });
    }

    const { rows } = await summariseAttendance(range);
    const row = rows.find((entry) => entry.userId === userId);

    expect(row.leaveByType).toEqual({ Casual: 2, Sick: 1 });
  });

  it('excludes untracked colleagues and counts them, so the screen can say so', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const tracked = await aUser(String(team._id));
    const untracked = await aUser(String(team._id), { tracked: false });

    await aDay(String(tracked._id), String(team._id), '2026-08-12', {});
    await aDay(String(untracked._id), String(team._id), '2026-08-12', {});

    const { rows, untrackedCount } = await summariseAttendance({
      ...range,
      teamId: String(team._id),
    });

    expect(rows.map((row) => row.userId)).toEqual([String(tracked._id)]);
    expect(untrackedCount).toBe(1);
  });

  it("keeps a departed colleague's figures and marks them no longer active (FR-2.4)", async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(userId, String(team._id), '2026-08-12', {});
    await softDeleteUser(
      userId,
      { dateOfLeaving: '2026-08-20', reason: 'Resigned' },
      actor,
      user.version,
    );

    const { rows } = await summariseAttendance({
      ...range,
      includeDeleted: true,
    });
    const row = rows.find((entry) => entry.userId === userId);

    expect(row.present).toBe(1);
    expect(row.deletedAt).toBeTruthy();
  });

  it('leaves a departed colleague out unless asked for them', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(userId, String(team._id), '2026-08-12', {});
    await softDeleteUser(
      userId,
      { dateOfLeaving: '2026-08-20', reason: 'Resigned' },
      actor,
      user.version,
    );

    const { rows } = await summariseAttendance(range);
    expect(rows.find((entry) => entry.userId === userId)).toBeUndefined();
  });

  it('narrows to one team and to one person', async () => {
    const teamA = await createTeam({ name: `A${codes}` }, actor);
    const teamB = await createTeam({ name: `B${codes}` }, actor);
    const one = await aUser(String(teamA._id));
    const two = await aUser(String(teamB._id));

    await aDay(String(one._id), String(teamA._id), '2026-08-12', {});
    await aDay(String(two._id), String(teamB._id), '2026-08-12', {});

    const byTeam = await summariseAttendance({
      ...range,
      teamId: String(teamA._id),
    });
    expect(byTeam.rows.map((row) => row.userId)).toEqual([String(one._id)]);

    const byUser = await summariseAttendance({
      ...range,
      userId: String(two._id),
    });
    expect(byUser.rows.map((row) => row.userId)).toEqual([String(two._id)]);
  });

  it('counts only the dates inside the range', async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await aUser(String(team._id));
    const userId = String(user._id);

    await aDay(userId, String(team._id), '2026-07-31', {});
    await aDay(userId, String(team._id), '2026-08-12', {});
    await aDay(userId, String(team._id), '2026-09-01', {});

    const { rows } = await summariseAttendance(range);
    expect(rows.find((entry) => entry.userId === userId).present).toBe(1);
  });

  it('returns no rows for a range with no records rather than throwing', async () => {
    expect(
      (await summariseAttendance({ from: '2030-01-01', to: '2030-01-31' }))
        .rows,
    ).toEqual([]);
  });
});

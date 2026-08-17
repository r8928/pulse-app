import { describe, expect, it } from 'vitest';
import {
  HALF_DAY_PERIOD,
  PUNCH_SOURCE,
  PUNCH_TYPE,
  ROLES,
} from '../constants/index.js';
import {
  cancelLeaveRecord,
  createHoliday,
  createLeaveRecord,
  createPunch,
  createShift,
  createTeam,
  createUser,
  getDayRecord,
  listLedgerEntriesForSource,
  setDayOverride,
  setWeeklyOffPattern,
  softDeletePunch,
  updatePunch,
  updateTeamPolicy,
} from '../database.js';
import { recalculateDays } from '../engine/recalculate.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * ARCHITECTURE §23.3 end to end, against a real database.
 *
 * The pure calculations are already covered by the engine's own suites; what
 * is proved here is the orchestration around them — that the right inputs
 * reach them, that the conclusions are stored once, that a re-run changes
 * nothing (I-9), and that a human decision survives one (I-6).
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

/** The seeded BR-9 profile B ladder, as scripts/seed.js writes it. */
const leaveDeductionLadder = [
  {
    latenessFrom: 10,
    latenessTo: 40,
    clockedFrom: 55,
    clockedTo: 80,
    deduction: 0.25,
  },
  {
    latenessFrom: 40,
    latenessTo: 55,
    clockedFrom: 33,
    clockedTo: 55,
    deduction: 0.5,
  },
  {
    latenessFrom: 55,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 33,
    deduction: 0.75,
  },
  {
    latenessFrom: null,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 0,
    deduction: 1,
    didNotAttend: true,
  },
];

const completePolicy = {
  leaveTypes: [
    { name: 'Casual', annualEntitlement: 10 },
    { name: 'Sick', annualEntitlement: 10 },
  ],
  automaticDeductionLeaveType: 'Casual',
  leaveDeductionLadder,
  shortDayThresholdPercent: 89,
  holidayWorkThresholdPercent: 22,
  midnightCrossingWindowHours: 8,
  duplicatePunchWindowMinutes: 10,
  wfhQuotaDaysPerMonth: 5,
};

let codes = 0;

describe('recalculateDays', () => {
  useTestDatabase();

  /**
   * 2026-08-12 is a Wednesday, 2026-08-15 a Saturday. The shift is
   * 09:00-18:00 Asia/Karachi (UTC+5, no DST), so 09:00 local is 04:00Z.
   */
  const aTrackedUserOnADayShift = async (policyOverrides = {}) => {
    const team = await createTeam({ name: `Team ${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      { ...completePolicy, ...policyOverrides },
      null,
      actor,
    );
    await setWeeklyOffPattern(
      String(team._id),
      { daysOfWeek: [0, 6] },
      null,
      actor,
    );

    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Days',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );

    const user = await createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `W-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );

    return { team, shift, user, userId: String(user._id) };
  };

  const punch = (userId, type, at) =>
    createPunch({ userId, type, at, source: PUNCH_SOURCE.FORM }, actor);

  const oneDay = (date = '2026-08-12') => ({ from: date, to: date });

  const ledgerFor = async (userId, date = '2026-08-12') => {
    const record = await getDayRecord(userId, date);
    return record
      ? listLedgerEntriesForSource('dayRecord', String(record._id))
      : [];
  };

  it('produces a WFO record and no ledger movement for a clean day', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');

    await recalculateDays(userId, oneDay());

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.dayStatus).toBe('WFO');
    expect(record.computed.workedMinutes).toBe(540);
    expect(record.computed.deduction).toBe(0);
    expect(record.computed.isCompliant).toBe(true);
    expect(record.exceptions).toEqual([]);
    expect(await ledgerFor(userId)).toHaveLength(0);
  });

  it('reproduces worked example A end to end (ARCHITECTURE 18.3)', async () => {
    // In 11:00 PKT, out 17:00 PKT: 120 late minutes, 360 worked.
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T06:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T12:00:00.000Z');

    await recalculateDays(userId, oneDay());

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.lateMinutes).toBe(120);
    expect(record.computed.workedMinutes).toBe(360);
    expect(record.computed.isShortDay).toBe(true);
    expect(record.computed.isCompliant).toBe(false);
    expect(record.computed.deduction).toBe(0.25);
    expect(record.computed.deductionRule).toBe('BR-9:band1');

    const entries = await ledgerFor(userId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entryType: 'AUTOMATIC_DEDUCTION',
      leaveType: 'Casual',
      amount: -0.25,
    });
  });

  it('changes nothing at all on a second run (I-9, NFR-15)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T06:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T12:00:00.000Z');

    await recalculateDays(userId, oneDay());
    const first = await getDayRecord(userId, '2026-08-12');

    const second = await recalculateDays(userId, oneDay());

    const after = await getDayRecord(userId, '2026-08-12');
    expect(second.recalculated).toBe(0);
    expect(after.version).toBe(first.version);
    expect(await ledgerFor(userId)).toHaveLength(1);
  });

  it('leaves an override standing and refreshes the engine value beneath it (I-6, FR-6.12)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T10:00:00.000Z');
    await recalculateDays(userId, oneDay());

    const before = await getDayRecord(userId, '2026-08-12');
    await setDayOverride(
      userId,
      '2026-08-12',
      { dayStatus: 'WFH', reason: 'Home internet outage' },
      before.version,
      actor,
    );

    // A later punch changes what the engine concludes about the hours.
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T11:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');
    await recalculateDays(userId, oneDay());

    const after = await getDayRecord(userId, '2026-08-12');
    expect(after.override.dayStatus).toBe('WFH');
    expect(after.override.reason).toBe('Home internet outage');
    expect(after.computed.workedMinutes).toBe(480);
    expect(after.computed.dayStatus).toBe('WFO'); // the engine's own answer
  });

  it('reverses and re-posts when a corrected punch changes the deduction (§19.4)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    const late = await punch(
      userId,
      PUNCH_TYPE.CHECK_IN,
      '2026-08-12T06:00:00.000Z',
    );
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T12:00:00.000Z');
    await recalculateDays(userId, oneDay());

    expect((await ledgerFor(userId)).map((entry) => entry.amount)).toEqual([
      -0.25,
    ]);

    // The punch was an hour out; corrected to an on-time arrival and a full day.
    await updatePunch(
      String(late._id),
      { at: '2026-08-12T04:00:00.000Z', reason: 'Imported two hours late' },
      late.version,
      actor,
    );
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');
    await recalculateDays(userId, oneDay());

    const entries = await ledgerFor(userId);
    const original = entries.find(
      (entry) => entry.entryType === 'AUTOMATIC_DEDUCTION',
    );
    const reversal = entries.find((entry) => entry.entryType === 'REVERSAL');

    expect(original.amount).toBe(-0.25); // untouched
    expect(reversal.amount).toBe(0.25);
    expect(entries.reduce((total, entry) => total + entry.amount, 0)).toBe(0);
  });

  it('raises MISSING_CHECK_OUT rather than treating the day as zero hours (FR-4.8, I-5)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');

    await recalculateDays(userId, oneDay());

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.exceptions).toContain('MISSING_CHECK_OUT');
    expect(record.computed.dayStatus).toBe('WFO');
  });

  it('flags a duplicate punch and keeps it, excluding it from pairing (FR-4.7, I-1)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    const duplicate = await punch(
      userId,
      PUNCH_TYPE.CHECK_IN,
      '2026-08-12T04:04:00.000Z',
    );
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');

    await recalculateDays(userId, oneDay());

    const { getPunchById } = await import('../database.js');
    const stored = await getPunchById(String(duplicate._id));
    expect(stored.isDuplicate).toBe(true);
    expect(stored.deletedAt).toBeNull();

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.workedMinutes).toBe(540);
    expect(record.exceptions).toEqual([]);
  });

  it('creates no record for an untouched date unless asked to materialise (D-18, D-15)', async () => {
    const { userId } = await aTrackedUserOnADayShift();

    await recalculateDays(userId, oneDay('2026-08-15')); // a Saturday
    expect(await getDayRecord(userId, '2026-08-15')).toBeNull();

    await recalculateDays(userId, oneDay('2026-08-15'), {
      materialiseUsers: [userId],
    });

    const record = await getDayRecord(userId, '2026-08-15');
    expect(record.dayType).toBe('WEEKLY_OFF');
    expect(record.computed.dayStatus).toBe('WEEKLY_OFF');
    expect(record.computed.deduction).toBe(0);
  });

  it('records HOLIDAY_WORK for punches on a holiday, with no deduction', async () => {
    const { team, userId } = await aTrackedUserOnADayShift();
    await createHoliday(
      {
        teamId: String(team._id),
        name: 'Independence Day',
        date: '2026-08-14',
        type: 'PUBLIC',
      },
      actor,
    );
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-14T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-14T13:00:00.000Z');

    await recalculateDays(userId, oneDay('2026-08-14'));

    const record = await getDayRecord(userId, '2026-08-14');
    expect(record.dayType).toBe('HOLIDAY');
    expect(record.computed.dayStatus).toBe('HOLIDAY_WORK');
    expect(record.computed.deduction).toBe(0);
    expect(record.computed.countsAsHolidayWork).toBe(true);
  });

  it('skips the ladder entirely on a full day of leave (D-11, BR-11)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await createLeaveRecord(
      {
        userId,
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Family matter',
      },
      actor,
    );

    await recalculateDays(userId, oneDay());

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.dayStatus).toBe('LEAVE');
    expect(record.computed.deduction).toBe(0);

    const entries = await ledgerFor(userId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entryType: 'LEAVE_AVAILED',
      leaveType: 'Casual',
      amount: -1,
    });
  });

  it('runs the ladder on the worked half of a half-day leave (D-11)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await createLeaveRecord(
      {
        userId,
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 0.5,
        halfDayPeriod: HALF_DAY_PERIOD.AFTERNOON,
        reason: 'Dentist',
      },
      actor,
    );

    // Worked the morning, but arrived at 11:00 PKT instead of 09:00.
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T06:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T08:30:00.000Z');

    await recalculateDays(userId, oneDay());

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.dayStatus).toBe('LEAVE');
    // Measured from the shift's own 09:00 start, because the AFTERNOON was
    // the half taken as leave.
    expect(record.computed.lateMinutes).toBe(120);
    expect(record.computed.deduction).toBeGreaterThan(0);

    const types = (await ledgerFor(userId))
      .map((entry) => entry.entryType)
      .sort();
    expect(types).toEqual(['AUTOMATIC_DEDUCTION', 'LEAVE_AVAILED']);
  });

  it('creates no record for a date outside the employment period (FR-2.12)', async () => {
    const { userId } = await aTrackedUserOnADayShift();

    await recalculateDays(userId, oneDay('2024-06-03'), {
      materialiseUsers: [userId],
    });

    expect(await getDayRecord(userId, '2024-06-03')).toBeNull();
  });

  it('creates no record for an untracked user (FR-2.10)', async () => {
    const { team, shift } = await aTrackedUserOnADayShift();
    const untracked = await createUser(
      {
        fullName: 'Contractor',
        employeeCode: `U-${codes++}`,
        employmentType: 'PERMANENT',
        tracked: false,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );

    await recalculateDays(String(untracked._id), oneDay(), {
      materialiseUsers: [String(untracked._id)],
    });

    expect(await getDayRecord(String(untracked._id), '2026-08-12')).toBeNull();
  });

  it('raises NO_SHIFT_ASSIGNED rather than guessing a status (FR-3.12)', async () => {
    const team = await createTeam({ name: `Shiftless ${codes}` }, actor);
    await updateTeamPolicy(String(team._id), completePolicy, null, actor);

    const user = await createUser(
      {
        fullName: 'No Shift',
        employeeCode: `N-${codes++}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
      },
      actor,
    );

    await recalculateDays(String(user._id), oneDay(), {
      materialiseUsers: [String(user._id)],
    });

    const record = await getDayRecord(String(user._id), '2026-08-12');
    expect(record.exceptions).toContain('NO_SHIFT_ASSIGNED');
    expect(record.shiftId).toBeNull();
    expect(record.computed.deduction).toBe(0);
  });

  it('reverses the LEAVE_AVAILED when the leave is cancelled', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    const leave = await createLeaveRecord(
      {
        userId,
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Family matter',
      },
      actor,
    );
    await recalculateDays(userId, oneDay());

    await cancelLeaveRecord(
      String(leave._id),
      'Came in after all',
      leave.version,
      actor,
    );
    await recalculateDays(userId, oneDay());

    const entries = await ledgerFor(userId);
    const availed = entries.find(
      (entry) => entry.entryType === 'LEAVE_AVAILED',
    );
    const reversal = entries.find((entry) => entry.entryType === 'REVERSAL');

    expect(availed.amount).toBe(-1); // untouched
    expect(reversal.amount).toBe(1);
    expect(String(reversal.reversalOf)).toBe(String(availed._id));

    /**
     * The day is now an unattended working day, so BR-9's did-not-attend row
     * applies and a full day is deducted. That is the correct outcome, not a
     * leftover: cancelling the authorisation does not make the absence go
     * away, it makes it unexcused.
     */
    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.dayStatus).toBe('ABSENT');
    expect(record.computed.deduction).toBe(1);
    expect(record.computed.deductionRule).toBe('BR-9:did-not-attend');

    const deduction = entries.find(
      (entry) => entry.entryType === 'AUTOMATIC_DEDUCTION',
    );
    expect(deduction.amount).toBe(-1);
  });

  it('excludes a soft-deleted punch from the day it was on', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    const out = await punch(
      userId,
      PUNCH_TYPE.CHECK_OUT,
      '2026-08-12T13:00:00.000Z',
    );
    await recalculateDays(userId, oneDay());
    expect(
      (await getDayRecord(userId, '2026-08-12')).computed.workedMinutes,
    ).toBe(540);

    await softDeletePunch(
      String(out._id),
      'Recorded for the wrong person',
      out.version,
      actor,
    );
    await recalculateDays(userId, oneDay());

    const record = await getDayRecord(userId, '2026-08-12');
    expect(record.computed.workedMinutes).toBe(0);
    expect(record.exceptions).toContain('MISSING_CHECK_OUT');
  });

  it('recalculates every tracked user when given no user, narrowed by team', async () => {
    const first = await aTrackedUserOnADayShift();
    const second = await aTrackedUserOnADayShift();

    await punch(first.userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(first.userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');
    await punch(second.userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(
      second.userId,
      PUNCH_TYPE.CHECK_OUT,
      '2026-08-12T13:00:00.000Z',
    );

    await recalculateDays(null, oneDay(), { teamId: String(first.team._id) });

    expect(await getDayRecord(first.userId, '2026-08-12')).not.toBeNull();
    expect(await getDayRecord(second.userId, '2026-08-12')).toBeNull();

    await recalculateDays(null, oneDay());
    expect(await getDayRecord(second.userId, '2026-08-12')).not.toBeNull();
  });

  it('accepts an open-ended range, which a team move produces (FR-3.14)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');

    const result = await recalculateDays(userId, {
      from: '2026-08-01',
      to: null,
    });

    expect(result.recalculated).toBe(1);
    expect(await getDayRecord(userId, '2026-08-12')).not.toBeNull();
  });

  it('bounds a fully open range by what the user actually has recorded', async () => {
    // A policy edit carries no effective date, so both ends are null. The
    // range resolves from the data rather than running from the epoch.
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');

    const result = await recalculateDays(userId, { from: null, to: null });

    expect(result.recalculated).toBe(1);
    expect(await getDayRecord(userId, '2026-08-12')).not.toBeNull();
  });

  it('credits the leave year on the way through, since no cron exists (D-12)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');

    const { replayBalance } = await import('../database.js');
    expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);

    await recalculateDays(userId, oneDay());

    // completePolicy seeds Casual at 10 for a user employed all year.
    expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(10);
  });

  it('credits nothing more on a second recalculation (I-9)', async () => {
    const { userId } = await aTrackedUserOnADayShift();
    await punch(userId, PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z');
    await punch(userId, PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z');

    await recalculateDays(userId, oneDay());
    await recalculateDays(userId, oneDay());

    const { replayBalance } = await import('../database.js');
    expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(10);
  });

  it('does nothing for a range with no activity in it', async () => {
    const { userId } = await aTrackedUserOnADayShift();

    expect(
      await recalculateDays(userId, { from: '2026-09-01', to: '2026-09-30' }),
    ).toEqual({
      recalculated: 0,
    });
  });
});

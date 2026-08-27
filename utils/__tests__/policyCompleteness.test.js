import { describe, expect, it } from 'vitest';
import { missingConfiguration } from '../policyCompleteness.js';

/**
 * FR-3.13 and invariant I-5: a required configuration value that is not set
 * does not get a default. It is named, flagged inline on S-17, and queued on
 * S-05 until somebody sets it.
 *
 * This is the one function that decides what "not set" means, so S-17 and
 * S-05 can never disagree about it.
 */

const complete = {
  team: { _id: 't1', name: 'General', managerId: 'u1', defaultShiftId: 's1' },
  shifts: [
    {
      _id: 's1',
      name: 'Day',
      startTime: '09:00',
      endTime: '18:00',
      requiredDailyMinutes: 540,
      graceMinutes: 30,
      timezone: 'Asia/Karachi',
    },
  ],
  calendar: { name: 'India' },
  weeklyOffPattern: { daysOfWeek: [6, 0] },
  policy: {
    leaveTypes: [{ name: 'Annual', annualEntitlement: 10 }],
    accrualPeriod: 'LEAVE_YEAR',
    carryForward: true,
    automaticDeductionLeaveType: 'Annual',
    leaveDeductionLadder: [{ deduction: 1 }],
    ptoAwardLadder: [{ award: 1 }],
    ptoValidityDays: 30,
    ctoApplicationLadder: [{ apply: 1 }],
    wfhQuotaDaysPerMonth: 5,
    shortDayThresholdPercent: 89,
    holidayWorkThresholdPercent: 22,
    midnightCrossingWindowHours: 6,
    duplicatePunchWindowMinutes: 2,
  },
};

const fieldsMissingFrom = (input) =>
  missingConfiguration(input).map((gap) => gap.field);

describe('missingConfiguration', () => {
  it('finds nothing wrong with a fully configured team', () => {
    expect(missingConfiguration(complete)).toEqual([]);
  });

  it('names the two windows spec.md gives no value for', () => {
    // ARCHITECTURE 8.3: both are per-team configuration that the spec never
    // assigns a number to, so seeding a guess would dress an invention up as
    // policy. They are unset on every team until an administrator sets them.
    const gaps = fieldsMissingFrom({
      ...complete,
      policy: {
        ...complete.policy,
        midnightCrossingWindowHours: undefined,
        duplicatePunchWindowMinutes: undefined,
      },
    });

    expect(gaps).toContain('midnightCrossingWindowHours');
    expect(gaps).toContain('duplicatePunchWindowMinutes');
  });

  it('reports an unset team manager', () => {
    // FR-3.1 requires exactly one, and spec.md names one for only one seeded
    // team — so the rest are prompted for rather than invented (design D-5).
    expect(
      fieldsMissingFrom({
        ...complete,
        team: { ...complete.team, managerId: null },
      }),
    ).toContain('managerId');
  });

  it('reports a team with no default shift', () => {
    expect(
      fieldsMissingFrom({
        ...complete,
        team: { ...complete.team, defaultShiftId: null },
      }),
    ).toContain('defaultShiftId');
  });

  it('reports a team with no shift at all', () => {
    expect(fieldsMissingFrom({ ...complete, shifts: [] })).toContain('shifts');
  });

  it('reports a shift with no timezone, which no default may fill', () => {
    // FR-3.10 and DC-5: there is no company-wide timezone to fall back to.
    const gaps = missingConfiguration({
      ...complete,
      shifts: [{ ...complete.shifts[0], timezone: null }],
    });

    expect(gaps.some((gap) => gap.field === 'timezone')).toBe(true);
    expect(gaps.find((gap) => gap.field === 'timezone').entity).toBe(
      'Shift Day',
    );
  });

  it('reports a missing weekly off pattern rather than assuming the weekend', () => {
    // FR-3.8: not assumed to be Saturday and Sunday.
    expect(
      fieldsMissingFrom({ ...complete, weeklyOffPattern: null }),
    ).toContain('weeklyOffPattern');
  });

  it('reports a team assigned to no calendar', () => {
    // D-29: never defaulted. There is no default calendar, and falling back to
    // Saturday and Sunday is the assumption FR-3.8 exists to forbid.
    expect(
      fieldsMissingFrom({
        ...complete,
        calendar: null,
        weeklyOffPattern: null,
      }),
    ).toContain('calendarId');
  });

  it('attributes a missing weekly off to the calendar, not the team', () => {
    // The fix is on S-26, so the prompt has to name the calendar to be
    // actionable.
    const gaps = missingConfiguration({ ...complete, weeklyOffPattern: null });
    const gap = gaps.find((each) => each.field === 'weeklyOffPattern');

    expect(gap.entity).toBe('Calendar India');
  });

  it('does not also report the calendar when one is assigned', () => {
    expect(
      fieldsMissingFrom({ ...complete, weeklyOffPattern: null }),
    ).not.toContain('calendarId');
  });

  it('accepts a weekly off pattern with no days, which is a real answer', () => {
    // A team that works every day is configured, not unconfigured. Only the
    // absence of a pattern is a gap.
    expect(
      fieldsMissingFrom({ ...complete, weeklyOffPattern: { daysOfWeek: [] } }),
    ).not.toContain('weeklyOffPattern');
  });

  it('reports a team with no policy document at all', () => {
    expect(
      fieldsMissingFrom({ ...complete, policy: null }).length,
    ).toBeGreaterThan(0);
  });

  it('reports an empty leave type list and an empty ladder', () => {
    const gaps = fieldsMissingFrom({
      ...complete,
      policy: {
        ...complete.policy,
        leaveTypes: [],
        leaveDeductionLadder: [],
      },
    });

    expect(gaps).toContain('leaveTypes');
    expect(gaps).toContain('leaveDeductionLadder');
  });

  it('accepts a zero threshold, which is a set value rather than an unset one', () => {
    // A team allowing no work from home sets the quota to zero. Treating zero
    // as absent would nag forever and is the classic falsy-check defect.
    expect(
      fieldsMissingFrom({
        ...complete,
        policy: { ...complete.policy, wfhQuotaDaysPerMonth: 0 },
      }),
    ).not.toContain('wfhQuotaDaysPerMonth');
  });

  it('states why each gap matters, so the prompt is actionable', () => {
    const [gap] = missingConfiguration({
      ...complete,
      calendar: null,
      weeklyOffPattern: null,
    });

    expect(gap.entity).toBe('General');
    expect(gap.why.length).toBeGreaterThan(0);
  });
});

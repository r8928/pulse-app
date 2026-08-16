import { describe, expect, it } from 'vitest';
import { resolveDayStatus, resolveDayType } from '../classify.js';

describe('resolveDayType', () => {
  it('returns HOLIDAY for a date on the team calendar', () => {
    const holidays = [{ date: '2026-03-23', deletedAt: null }];
    expect(resolveDayType('2026-03-23', holidays, { daysOfWeek: [] })).toBe(
      'HOLIDAY',
    );
  });

  it('ignores a soft-deleted holiday entry', () => {
    const holidays = [{ date: '2026-03-23', deletedAt: new Date() }];
    expect(resolveDayType('2026-03-23', holidays, { daysOfWeek: [] })).toBe(
      'WORKING',
    );
  });

  it('returns WEEKLY_OFF for a day matching the pattern', () => {
    // 2026-08-15 is a Saturday (getDay() === 6).
    expect(resolveDayType('2026-08-15', [], { daysOfWeek: [6, 0] })).toBe(
      'WEEKLY_OFF',
    );
  });

  it('returns WORKING for an ordinary weekday with no holiday', () => {
    // 2026-08-12 is a Wednesday.
    expect(resolveDayType('2026-08-12', [], { daysOfWeek: [6, 0] })).toBe(
      'WORKING',
    );
  });

  it('prefers HOLIDAY when a date is both a holiday and a weekly off (§15 documented decision)', () => {
    const holidays = [{ date: '2026-08-15', deletedAt: null }]; // a Saturday
    expect(resolveDayType('2026-08-15', holidays, { daysOfWeek: [6, 0] })).toBe(
      'HOLIDAY',
    );
  });

  it('treats a team with no weekly-off pattern set as never weekly-off', () => {
    expect(resolveDayType('2026-08-15', [], null)).toBe('WORKING');
  });

  it('supports a non-weekend pattern (FR-3.8, the Sales & Marketing seed)', () => {
    // 2026-08-14 is a Friday; Sales & Marketing's pattern is [0, 6] Sun/Sat,
    // so Friday is WORKING for them but WEEKLY_OFF for a team off Fri/Sat.
    expect(resolveDayType('2026-08-14', [], { daysOfWeek: [0, 6] })).toBe(
      'WORKING',
    );
    expect(resolveDayType('2026-08-14', [], { daysOfWeek: [5, 6] })).toBe(
      'WEEKLY_OFF',
    );
  });
});

describe('resolveDayStatus', () => {
  it('returns the override first, ahead of everything else', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: { dayStatus: 'WFH' },
      authorisedLeave: { leaveType: 'Casual' },
      punches: [],
    });
    expect(status).toBe('WFH');
  });

  it('returns LEAVE when authorised, ahead of what punches show (§16.2 worked example)', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: null,
      authorisedLeave: { leaveType: 'Sick', amount: 1 },
      punches: [{ _id: '1' }], // punched in at 09:02, per the worked example
    });
    expect(status).toBe('LEAVE');
  });

  it('returns HOLIDAY_WORK for any punches at all on a non-working day, however few', () => {
    const status = resolveDayStatus({
      dayType: 'HOLIDAY',
      override: null,
      authorisedLeave: null,
      punches: [{ _id: '1' }],
    });
    expect(status).toBe('HOLIDAY_WORK');
  });

  it('returns HOLIDAY for an untouched holiday', () => {
    const status = resolveDayStatus({
      dayType: 'HOLIDAY',
      override: null,
      authorisedLeave: null,
      punches: [],
    });
    expect(status).toBe('HOLIDAY');
  });

  it('returns WEEKLY_OFF for an untouched weekly-off day', () => {
    const status = resolveDayStatus({
      dayType: 'WEEKLY_OFF',
      override: null,
      authorisedLeave: null,
      punches: [],
    });
    expect(status).toBe('WEEKLY_OFF');
  });

  it('returns WFO for a working day with punches', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: null,
      authorisedLeave: null,
      punches: [{ _id: '1' }],
    });
    expect(status).toBe('WFO');
  });

  it('returns ABSENT for a working day with no punches, no leave, no override', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: null,
      authorisedLeave: null,
      punches: [],
    });
    expect(status).toBe('ABSENT');
  });
});

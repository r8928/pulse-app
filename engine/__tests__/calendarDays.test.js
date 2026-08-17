import { describe, expect, it } from 'vitest';
import { DAY_TYPE } from '../../constants/index.js';
import { countCalendarDays } from '../calendarDays.js';

/**
 * `FR-3.9`, and MVP criterion 19: **working-day and holiday counts derive
 * from the calendar of the team the user held on each date**, not their
 * current team.
 *
 * That is the whole point of this function and the reason it cannot be a
 * `$group` in the database: a user who moved teams mid-period has two
 * calendars over one range, and the answer depends on which date you are
 * asking about.
 *
 * Pure — every input is passed in, nothing is fetched (`ARCHITECTURE.md` §8.2).
 */

const holiday = (date) => ({ date, deletedAt: null });

const weekends = { daysOfWeek: [0, 6] };

/** One tenure covering everything the tests ask about. */
const tenures = [{ startDate: '2020-01-01', endDate: null, deletedAt: null }];

describe('countCalendarDays', () => {
  it('counts a plain working week as five working days and no holidays', () => {
    // Monday 2026-08-10 to Sunday 2026-08-16.
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-16',
      tenures,
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: { t1: [] },
      weeklyOffByTeam: { t1: weekends },
    });

    expect(counts).toEqual({
      workingDays: 5,
      holidays: 0,
      weeklyOffDays: 2,
      daysInPeriod: 7,
    });
  });

  it('takes a holiday out of the working days rather than counting it twice', () => {
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-16',
      tenures,
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: { t1: [holiday('2026-08-12')] },
      weeklyOffByTeam: { t1: weekends },
    });

    expect(counts.workingDays).toBe(4);
    expect(counts.holidays).toBe(1);
    expect(counts.workingDays + counts.holidays + counts.weeklyOffDays).toBe(7);
  });

  it('uses each date’s own team calendar across a mid-period move (FR-3.9, FR-3.14)', () => {
    // Moved from t1 to t2 on the 13th. t1 keeps a holiday on the 11th, t2 on
    // the 14th — so a naive "current team" count would find exactly one of
    // them and be wrong either way.
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-14',
      tenures,
      teamAssignments: [
        {
          teamId: 't1',
          effectiveFrom: '2020-01-01',
          effectiveTo: '2026-08-12',
        },
        { teamId: 't2', effectiveFrom: '2026-08-13', effectiveTo: null },
      ],
      fallbackTeamId: 't2',
      holidaysByTeam: {
        t1: [holiday('2026-08-11')],
        t2: [holiday('2026-08-14')],
      },
      weeklyOffByTeam: { t1: weekends, t2: weekends },
    });

    // Mon–Fri, with one holiday on each side of the move.
    expect(counts.holidays).toBe(2);
    expect(counts.workingDays).toBe(3);
  });

  it('honours a team that works a different week (FR-3.8)', () => {
    // Friday and Saturday off rather than Saturday and Sunday.
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-16',
      tenures,
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: { t1: [] },
      weeklyOffByTeam: { t1: { daysOfWeek: [5, 6] } },
    });

    expect(counts.workingDays).toBe(5);
    expect(counts.weeklyOffDays).toBe(2);
  });

  it('counts nothing for dates outside the employment period (FR-2.12)', () => {
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-16',
      tenures: [
        { startDate: '2026-08-10', endDate: '2026-08-12', deletedAt: null },
      ],
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: { t1: [] },
      weeklyOffByTeam: { t1: weekends },
    });

    // Mon, Tue, Wed employed — three working days, and the rest is not
    // absence, it is simply not employment.
    expect(counts.workingDays).toBe(3);
    expect(counts.daysInPeriod).toBe(3);
  });

  it('answers all zeroes for a range entirely outside the period', () => {
    expect(
      countCalendarDays({
        from: '2026-08-10',
        to: '2026-08-16',
        tenures: [
          { startDate: '2020-01-01', endDate: '2020-12-31', deletedAt: null },
        ],
        teamAssignments: [],
        fallbackTeamId: 't1',
        holidaysByTeam: { t1: [] },
        weeklyOffByTeam: { t1: weekends },
      }),
    ).toEqual({
      workingDays: 0,
      holidays: 0,
      weeklyOffDays: 0,
      daysInPeriod: 0,
    });
  });

  it('counts a gap between two tenures as neither employed nor absent', () => {
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-14',
      tenures: [
        { startDate: '2026-08-10', endDate: '2026-08-11', deletedAt: null },
        { startDate: '2026-08-14', endDate: null, deletedAt: null },
      ],
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: { t1: [] },
      weeklyOffByTeam: { t1: weekends },
    });

    expect(counts.daysInPeriod).toBe(3);
    expect(counts.workingDays).toBe(3);
  });

  it('does not guess a calendar it was never given (DC-6)', () => {
    // A team with no weekly-off pattern set: every date reads WORKING, which
    // is honest — the queue on S-05 is what says the pattern is missing, and
    // inventing a weekend here would hide it.
    const counts = countCalendarDays({
      from: '2026-08-10',
      to: '2026-08-16',
      tenures,
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: {},
      weeklyOffByTeam: {},
    });

    expect(counts.workingDays).toBe(7);
    expect(counts.weeklyOffDays).toBe(0);
  });

  it('agrees with resolveDayType, which is what the day records used', () => {
    // NFR-8: a report totalled one way and a day record classified another is
    // exactly the drift that makes two screens disagree.
    const counts = countCalendarDays({
      from: '2026-08-15',
      to: '2026-08-15',
      tenures,
      teamAssignments: [],
      fallbackTeamId: 't1',
      holidaysByTeam: { t1: [holiday('2026-08-15')] },
      weeklyOffByTeam: { t1: weekends },
    });

    // 15 August 2026 is a Saturday AND a holiday. resolveDayType resolves
    // HOLIDAY, because it was entered for this team explicitly.
    expect(counts.holidays).toBe(1);
    expect(counts.weeklyOffDays).toBe(0);
    expect(DAY_TYPE.HOLIDAY).toBe('HOLIDAY');
  });
});

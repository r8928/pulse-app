import { describe, expect, it } from 'vitest';
import {
  deductionFor,
  proposeCtoApplication,
  proposePtoAward,
} from '../ladders.js';

// The exact BR-9 seed profile B shape from scripts/seed.js, after Task 10's
// didNotAttend fix.
const ladder = [
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

describe('deductionFor', () => {
  it('matches worked example A: lateness and hours agree (ARCHITECTURE 18.3)', () => {
    const deduction = deductionFor({
      latenessPercent: 22.222,
      clockedPercent: 66.667,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.25);
  });

  it('matches worked example B: on time but short hours still deducts (ARCHITECTURE 18.4)', () => {
    const deduction = deductionFor({
      latenessPercent: 3.7,
      clockedPercent: 22.2,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.75);
  });

  it('matches worked example C: a 6-hour shift, same percentages (ARCHITECTURE 18.5)', () => {
    const deduction = deductionFor({
      latenessPercent: 25,
      clockedPercent: 75,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.25);
  });

  it('returns the did-not-attend row, found by its flag, when attended is false', () => {
    const deduction = deductionFor({
      latenessPercent: 0,
      clockedPercent: 0,
      attended: false,
      ladder,
    });
    expect(deduction).toBe(1);
  });

  it('takes the worse of the two tests when they disagree (BR-9)', () => {
    // Lateness band 1 (0.25) but clocked band 3 (0.75) — clocked wins.
    const deduction = deductionFor({
      latenessPercent: 15,
      clockedPercent: 10,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.75);
  });

  it('returns 0 when neither band is reached', () => {
    const deduction = deductionFor({
      latenessPercent: 5,
      clockedPercent: 95,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0);
  });

  it('treats lateness bands as (from, to] and clocked bands as [from, to)', () => {
    // Exactly 10% lateness does NOT qualify band 1 (over 10, not at 10).
    expect(
      deductionFor({
        latenessPercent: 10,
        clockedPercent: 95,
        attended: true,
        ladder,
      }),
    ).toBe(0);
    // Exactly 40% lateness DOES still qualify band 1 (up to and including 40).
    expect(
      deductionFor({
        latenessPercent: 40,
        clockedPercent: 95,
        attended: true,
        ladder,
      }),
    ).toBe(0.25);
    // Exactly 80% clocked does NOT qualify band 1 (under 80, not at 80).
    expect(
      deductionFor({
        latenessPercent: 0,
        clockedPercent: 80,
        attended: true,
        ladder,
      }),
    ).toBe(0);
    // Exactly 55% clocked DOES qualify band 1 (55 up to under 80).
    expect(
      deductionFor({
        latenessPercent: 0,
        clockedPercent: 55,
        attended: true,
        ladder,
      }),
    ).toBe(0.25);
  });

  it('returns 0 for an attended day against an unconfigured did-not-attend row (I-5: no guess)', () => {
    const noFlagLadder = ladder.map(({ didNotAttend, ...row }) => row);
    const deduction = deductionFor({
      latenessPercent: 0,
      clockedPercent: 0,
      attended: false,
      ladder: noFlagLadder,
    });
    expect(deduction).toBe(0);
  });
});

const shift = { requiredDailyMinutes: 540 };

const holidayWorkDay = (workedMinutes, counts = true) => ({
  computed: {
    dayStatus: 'HOLIDAY_WORK',
    workedMinutes,
    countsAsHolidayWork: counts,
  },
  override: null,
});

const wfoDay = (workedMinutes) => ({
  computed: { dayStatus: 'WFO', workedMinutes, countsAsHolidayWork: false },
  override: null,
});

describe('proposePtoAward (D-20)', () => {
  it('proposes BR-18 for a HOLIDAY_WORK day under a full shift', () => {
    expect(
      proposePtoAward({
        dayRecord: holidayWorkDay(300),
        nextWorkingDayRecord: null,
        shift,
        nextWorkingDayShift: null,
      }),
    ).toEqual({ rule: 'BR-18', amount: 0.5 });
  });

  it('proposes BR-19 for a HOLIDAY_WORK day of a full shift or more', () => {
    expect(
      proposePtoAward({
        dayRecord: holidayWorkDay(540),
        nextWorkingDayRecord: null,
        shift,
        nextWorkingDayShift: null,
      }),
    ).toEqual({ rule: 'BR-19', amount: 1 });
  });

  it('proposes BR-20 instead of BR-19 when the next working day is also fully worked', () => {
    expect(
      proposePtoAward({
        dayRecord: holidayWorkDay(560),
        nextWorkingDayRecord: wfoDay(545),
        shift,
        nextWorkingDayShift: shift,
      }),
    ).toEqual({ rule: 'BR-20', amount: 2 });
  });

  it('proposes BR-19 on its own when the next working day is only partly worked', () => {
    expect(
      proposePtoAward({
        dayRecord: holidayWorkDay(560),
        nextWorkingDayRecord: wfoDay(300),
        shift,
        nextWorkingDayShift: shift,
      }),
    ).toEqual({ rule: 'BR-19', amount: 1 });
  });

  it('proposes nothing below the BR-27 threshold, even though the status reads HOLIDAY_WORK', () => {
    expect(
      proposePtoAward({
        dayRecord: holidayWorkDay(60, false),
        nextWorkingDayRecord: null,
        shift,
        nextWorkingDayShift: null,
      }),
    ).toBeNull();
  });

  it('proposes nothing for an ordinary working day', () => {
    expect(
      proposePtoAward({
        dayRecord: wfoDay(540),
        nextWorkingDayRecord: null,
        shift,
        nextWorkingDayShift: null,
      }),
    ).toBeNull();
  });

  it('treats a missing next-working-day record as not worked, not as an error', () => {
    expect(() =>
      proposePtoAward({
        dayRecord: holidayWorkDay(560),
        nextWorkingDayRecord: null,
        shift,
        nextWorkingDayShift: shift,
      }),
    ).not.toThrow();
  });
});

const ctoLadder = [
  { rule: 'BR-22', latenessFrom: 22, latenessTo: 44, apply: 0.25 },
  { rule: 'BR-23', latenessFrom: 44, latenessTo: 67, apply: 0.5 },
  { rule: 'BR-24', latenessFrom: 67, latenessTo: null, apply: 0.75 },
  {
    rule: 'BR-25',
    latenessFrom: null,
    latenessTo: null,
    apply: 1,
    didNotAttend: true,
  },
];

describe('proposeCtoApplication (BR-22 to BR-26)', () => {
  it('proposes BR-22 just over its lower bound', () => {
    expect(
      proposeCtoApplication({
        latenessPercent: 22.1,
        attended: true,
        ladder: ctoLadder,
      }),
    ).toEqual({ rule: 'BR-22', amount: 0.25 });
  });

  it('treats the band boundary as inclusive on the upper end, exclusive on the lower', () => {
    expect(
      proposeCtoApplication({
        latenessPercent: 22,
        attended: true,
        ladder: ctoLadder,
      }),
    ).toBeNull();

    expect(
      proposeCtoApplication({
        latenessPercent: 44,
        attended: true,
        ladder: ctoLadder,
      }),
    ).toEqual({ rule: 'BR-22', amount: 0.25 });
  });

  it('proposes BR-24 unbounded above', () => {
    expect(
      proposeCtoApplication({
        latenessPercent: 90,
        attended: true,
        ladder: ctoLadder,
      }),
    ).toEqual({ rule: 'BR-24', amount: 0.75 });
  });

  it('proposes BR-25 for a day not attended at all, found by its flag', () => {
    expect(
      proposeCtoApplication({
        latenessPercent: 0,
        attended: false,
        ladder: ctoLadder,
      }),
    ).toEqual({ rule: 'BR-25', amount: 1 });
  });

  it('proposes nothing below every band', () => {
    expect(
      proposeCtoApplication({
        latenessPercent: 10,
        attended: true,
        ladder: ctoLadder,
      }),
    ).toBeNull();
  });

  it('proposes nothing against an empty ladder rather than guessing', () => {
    expect(
      proposeCtoApplication({
        latenessPercent: 90,
        attended: true,
        ladder: [],
      }),
    ).toBeNull();
  });
});

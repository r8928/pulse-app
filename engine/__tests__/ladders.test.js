import { describe, expect, it } from 'vitest';
import { deductionFor } from '../ladders.js';

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

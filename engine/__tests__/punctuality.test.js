import { describe, expect, it } from 'vitest';
import {
  clockedPercent,
  earlyMinutes,
  effectiveRequirement,
  isCompliant,
  isShortDay,
  lateMinutes,
  latenessPercent,
} from '../punctuality.js';

// Not shiftWindow's raw return value — the caller combines shiftWindow's
// start/end with requiredDailyMinutes from the shift object itself.
const shiftRequirement = {
  start: new Date('2026-08-12T04:00:00Z'), // 09:00 PKT
  end: new Date('2026-08-12T13:00:00Z'), // 18:00 PKT
  requiredDailyMinutes: 540,
};

describe('effectiveRequirement', () => {
  it('returns the shift unchanged for an ordinary (non-half-day) date', () => {
    const result = effectiveRequirement(shiftRequirement, null);
    expect(result).toEqual({
      checkStart: shiftRequirement.start,
      checkEnd: shiftRequirement.end,
      requiredMinutes: 540,
    });
  });

  it('checks the morning against the normal start when the AFTERNOON is leave (D-11)', () => {
    const result = effectiveRequirement(shiftRequirement, 'AFTERNOON');
    expect(result.checkStart.toISOString()).toBe('2026-08-12T04:00:00.000Z'); // 09:00
    expect(result.checkEnd.toISOString()).toBe('2026-08-12T08:30:00.000Z'); // 13:30 = midpoint
    expect(result.requiredMinutes).toBe(270);
  });

  it('checks the afternoon against the midpoint when the MORNING is leave (D-11)', () => {
    const result = effectiveRequirement(shiftRequirement, 'MORNING');
    expect(result.checkStart.toISOString()).toBe('2026-08-12T08:30:00.000Z'); // 13:30 = midpoint
    expect(result.checkEnd.toISOString()).toBe('2026-08-12T13:00:00.000Z'); // 18:00, unchanged
    expect(result.requiredMinutes).toBe(270);
  });
});

describe('lateMinutes / isCompliant / isShortDay (ARCHITECTURE 18.3, worked example A)', () => {
  // 9h shift (540 min), grace 30, 09:00-18:00. Check in 11:00, check out 17:00.
  const checkStart = new Date('2026-08-12T04:00:00Z'); // 09:00 PKT
  const checkEnd = new Date('2026-08-12T13:00:00Z'); // 18:00 PKT
  const firstCheckIn = new Date('2026-08-12T06:00:00Z'); // 11:00 PKT
  const lastCheckOut = new Date('2026-08-12T12:00:00Z'); // 17:00 PKT

  it('computes 120 late minutes', () => {
    expect(lateMinutes(firstCheckIn, checkStart)).toBe(120);
  });

  it('is not compliant against a 30-minute grace', () => {
    expect(isCompliant(120, 30)).toBe(false);
  });

  it('computes latenessPercent as 22.2% of the 540-minute requirement', () => {
    expect(latenessPercent(120, 540)).toBeCloseTo(22.222, 2);
  });

  it('computes clockedPercent from 360 worked minutes as 66.7%', () => {
    expect(clockedPercent(360, 540)).toBeCloseTo(66.667, 2);
  });

  it('flags 360 worked minutes as a short day against an 89% threshold', () => {
    expect(isShortDay(360, 540, 89)).toBe(true); // 360 < 540*0.89 = 480.6
  });

  it('computes 0 early minutes when checkout matches the window end', () => {
    expect(earlyMinutes(checkEnd, checkEnd)).toBe(0);
  });

  it('computes a positive early-departure minutes when checkout precedes the window end', () => {
    // lastCheckOut here (17:00) is 1 hour before an 18:00 window end.
    expect(earlyMinutes(lastCheckOut, checkEnd)).toBe(60);
  });
});

describe('lateMinutes / earlyMinutes with no punches', () => {
  it('returns 0 for a null first check-in (ABSENT carries the meaning, not a number here)', () => {
    expect(lateMinutes(null, new Date('2026-08-12T04:00:00Z'))).toBe(0);
  });

  it('returns 0 for a null last check-out', () => {
    expect(earlyMinutes(null, new Date('2026-08-12T13:00:00Z'))).toBe(0);
  });
});

describe('a shift that is not 9 hours (ARCHITECTURE 18.5)', () => {
  // Support team, 6h shift (360 min), 10:00-16:00. Check in 11:30, check out 16:00.
  it('computes 90 late minutes and 25% lateness', () => {
    const checkStart = new Date('2026-08-12T05:00:00Z'); // 10:00 PKT
    const firstCheckIn = new Date('2026-08-12T06:30:00Z'); // 11:30 PKT
    expect(lateMinutes(firstCheckIn, checkStart)).toBe(90);
    expect(latenessPercent(90, 360)).toBe(25);
  });
});

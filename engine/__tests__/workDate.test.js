import { describe, expect, it } from 'vitest';
import { resolveWorkDate, shiftWindow } from '../workDate.js';

const karachiDay = {
  startTime: '09:00',
  endTime: '18:00',
  timezone: 'Asia/Karachi',
};
const karachiNight = {
  startTime: '19:00',
  endTime: '04:00',
  timezone: 'Asia/Karachi',
};
const pacificNight = {
  startTime: '19:00',
  endTime: '04:00',
  timezone: 'America/Los_Angeles',
};

describe('shiftWindow', () => {
  it('resolves an ordinary day shift to same-day UTC instants', () => {
    // Asia/Karachi is UTC+5, no DST.
    const window = shiftWindow(karachiDay, '2026-08-12');
    expect(window.invalidField).toBeNull();
    expect(window.start.toISOString()).toBe('2026-08-12T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-08-12T13:00:00.000Z');
  });

  it('rolls a crossing shift onto the next calendar day (ARCHITECTURE 13.4)', () => {
    const window = shiftWindow(karachiNight, '2026-03-09');
    expect(window.start.toISOString()).toBe('2026-03-09T14:00:00.000Z'); // 2026-03-09 19:00 PKT
    expect(window.end.toISOString()).toBe('2026-03-09T23:00:00.000Z'); // 2026-03-10 04:00 PKT (UTC+5, so still the 9th in UTC)
  });

  it('shrinks a night shift to 8 hours on the US spring-forward night', () => {
    // America/Los_Angeles: clocks spring forward 2026-03-08 02:00 -> 03:00.
    // A shift starting 2026-03-07 19:00 and ending 2026-03-08 04:00 spans
    // that loss, so its real elapsed time is 8h, not the nominal 9h.
    const window = shiftWindow(pacificNight, '2026-03-07');
    const hours = (window.end.getTime() - window.start.getTime()) / 3600000;
    expect(hours).toBe(8);
  });

  it('grows a night shift to 10 hours on the US fall-back night', () => {
    // Clocks fall back 2026-11-01 02:00 -> 01:00. A shift starting
    // 2026-10-31 19:00 and ending 2026-11-01 04:00 spans that repeated
    // hour, so its real elapsed time is 10h, not the nominal 9h.
    const window = shiftWindow(pacificNight, '2026-10-31');
    const hours = (window.end.getTime() - window.start.getTime()) / 3600000;
    expect(hours).toBe(10);
  });

  it('rejects a shift start that falls in the spring-forward gap', () => {
    // 2026-03-08 02:30 America/Los_Angeles never happened.
    const gapShift = {
      startTime: '02:30',
      endTime: '11:30',
      timezone: 'America/Los_Angeles',
    };
    const window = shiftWindow(gapShift, '2026-03-08');
    expect(window.invalidField).toBe('start');
    expect(window.start).toBeNull();
  });

  it('takes the first occurrence of an ambiguous fall-back local time', () => {
    // 01:30 America/Los_Angeles happens twice on 2026-11-01. The first
    // occurrence is PDT (UTC-7): 08:30Z, not the second (PST, UTC-8): 09:30Z.
    const ambiguousShift = {
      startTime: '01:30',
      endTime: '10:00',
      timezone: 'America/Los_Angeles',
    };
    const window = shiftWindow(ambiguousShift, '2026-11-01');
    expect(window.start.toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });
});

const gcShift = {
  startTime: '19:00',
  endTime: '04:00',
  timezone: 'Asia/Karachi',
  crossingWindowHours: 8,
};

const gcAssignment = {
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  shift: gcShift,
};

describe('resolveWorkDate', () => {
  it('resolves the night-shift worked example exactly (ARCHITECTURE 13.4)', () => {
    // Punch instants below are the local times converted to UTC by hand:
    // 2026-03-09 19:05 PKT = 2026-03-09T14:05:00Z
    // 2026-03-10 02:30 PKT = 2026-03-09T21:30:00Z
    // 2026-03-10 19:30 PKT = 2026-03-10T14:30:00Z
    expect(
      resolveWorkDate(new Date('2026-03-09T14:05:00Z'), [gcAssignment]),
    ).toEqual({
      workDate: '2026-03-09',
      exceptionCode: null,
    });

    expect(
      resolveWorkDate(new Date('2026-03-09T21:30:00Z'), [gcAssignment]),
    ).toEqual({
      workDate: '2026-03-09',
      exceptionCode: null,
    });

    expect(
      resolveWorkDate(new Date('2026-03-10T14:30:00Z'), [gcAssignment]),
    ).toEqual({
      workDate: '2026-03-10',
      exceptionCode: null,
    });
  });

  it('raises NO_SHIFT_ASSIGNED with no covering assignment', () => {
    const result = resolveWorkDate(new Date('2026-03-09T14:05:00Z'), []);
    expect(result).toEqual({
      workDate: null,
      exceptionCode: 'NO_SHIFT_ASSIGNED',
    });
  });

  it('raises SHIFT_CONFIGURATION_INCOMPLETE when the crossing window is unset (§8.3)', () => {
    const unconfigured = {
      ...gcAssignment,
      shift: { ...gcShift, crossingWindowHours: undefined },
    };
    const result = resolveWorkDate(new Date('2026-03-09T14:05:00Z'), [
      unconfigured,
    ]);
    expect(result).toEqual({
      workDate: null,
      exceptionCode: 'SHIFT_CONFIGURATION_INCOMPLETE',
    });
  });

  it('raises PUNCH_OUTSIDE_SHIFT_WINDOW for a punch far from any shift', () => {
    // An 8h crossing window is generous enough to make every instant of
    // every day reachable from SOME candidate date on this 9h shift (that
    // is why ARCHITECTURE.md's own worked example uses 8h — it makes the
    // three punches unambiguous, not because 8h is realistic). A 1h window
    // is used here specifically so "outside even widened" is reachable: a
    // punch at 12:00 PKT sits in the middle of the 13-hour gap between the
    // previous night's widened end (05:00 PKT) and this night's widened
    // start (18:00 PKT).
    const tightAssignment = {
      ...gcAssignment,
      shift: { ...gcShift, crossingWindowHours: 1 },
    };
    const result = resolveWorkDate(new Date('2026-03-09T07:00:00Z'), [
      tightAssignment,
    ]);
    expect(result).toEqual({
      workDate: null,
      exceptionCode: 'PUNCH_OUTSIDE_SHIFT_WINDOW',
    });
  });

  it('prefers a match that fits the ordinary window over one that only fits widened, when two assignments overlap (§13.1)', () => {
    const dayShift = {
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'Asia/Karachi',
      crossingWindowHours: 8,
    };
    const oldAssignment = {
      effectiveFrom: '2025-01-01',
      effectiveTo: '2026-03-09',
      shift: gcShift, // night shift, ends 2026-03-09
    };
    const newAssignment = {
      effectiveFrom: '2026-03-10',
      effectiveTo: null,
      shift: dayShift, // day shift, starts 2026-03-10
    };

    // A punch at 2026-03-10 10:00 PKT (05:00Z) is genuinely ambiguous: it
    // fits inside the OLD night shift's window only via the widened crossing
    // buffer (the raw window ends 04:00 the same morning), AND it fits
    // inside the NEW day shift's ordinary, unwidened window. The ordinary
    // match wins.
    const result = resolveWorkDate(new Date('2026-03-10T05:00:00Z'), [
      oldAssignment,
      newAssignment,
    ]);
    expect(result).toEqual({ workDate: '2026-03-10', exceptionCode: null });
  });
});

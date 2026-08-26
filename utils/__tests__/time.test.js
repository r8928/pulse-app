import { describe, expect, it } from 'vitest';
import { formatClockTime } from '../time.js';

/**
 * A stored clock time, rendered the way the office reads one.
 *
 * Shifts are stored as `HH:mm` because that is what a `type='time'` input
 * gives and what sorts correctly in a query. Nobody in the office says
 * "eighteen hundred", so `S-17` renders the same value as `6:00 PM`. The two
 * are the same fact in different clothes — this converts between them and
 * changes nothing else.
 */

describe('formatClockTime', () => {
  it('renders a morning time without a leading zero', () => {
    expect(formatClockTime('09:00')).toBe('9:00 AM');
  });

  it('renders an evening time on the 12-hour clock', () => {
    expect(formatClockTime('19:00')).toBe('7:00 PM');
  });

  it('keeps the minutes when they are not on the hour', () => {
    expect(formatClockTime('09:30')).toBe('9:30 AM');
  });

  /**
   * The two the 12-hour clock gets wrong if the conversion is hand-rolled:
   * midnight is 12 AM and noon is 12 PM, not 0 AM and 0 PM.
   */
  it('renders midnight as 12 AM', () => {
    expect(formatClockTime('00:00')).toBe('12:00 AM');
  });

  it('renders noon as 12 PM', () => {
    expect(formatClockTime('12:00')).toBe('12:00 PM');
  });

  it('renders the last minute of the day as 11:59 PM', () => {
    expect(formatClockTime('23:59')).toBe('11:59 PM');
  });

  /**
   * A shift row is rendered before its times are known — an import in
   * progress, a document written before `FR-3.3` was configured. A table cell
   * showing "Invalid Date" is worse than one showing nothing, so the input is
   * handed back untouched rather than guessed at (`DC-6`).
   */
  it('hands back a value that is not a clock time, rather than guessing', () => {
    expect(formatClockTime('not a time')).toBe('not a time');
    expect(formatClockTime('25:00')).toBe('25:00');
  });

  it('has nothing to render for an absent time', () => {
    expect(formatClockTime(null)).toBe('');
    expect(formatClockTime(undefined)).toBe('');
    expect(formatClockTime('')).toBe('');
  });
});

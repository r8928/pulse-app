import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration } from '../duration.js';

describe('formatDuration', () => {
  it('reads hours and padded minutes', () => {
    expect(formatDuration(482)).toBe('8h 02m');
  });

  it('reads a whole number of hours', () => {
    expect(formatDuration(540)).toBe('9h 00m');
  });

  it('reads under an hour', () => {
    expect(formatDuration(7)).toBe('0h 07m');
  });

  it('reads zero as a duration rather than as nothing', () => {
    expect(formatDuration(0)).toBe('0h 00m');
  });

  it('rounds a fractional minute rather than printing it', () => {
    expect(formatDuration(59.6)).toBe('1h 00m');
  });
});

describe('formatClock', () => {
  it("reads an instant in the shift's own timezone, not the reader's", () => {
    // 04:02Z is 09:02 in Asia/Karachi (UTC+5).
    expect(formatClock(new Date('2026-08-12T04:02:00Z'), 'Asia/Karachi')).toBe(
      '09:02',
    );
  });

  it('reads the same instant differently in another zone', () => {
    expect(formatClock(new Date('2026-08-12T04:02:00Z'), 'UTC')).toBe('04:02');
  });

  it('reads a night-shift check-out on the far side of midnight', () => {
    // 21:30Z is 02:30 the next morning in Karachi — the reason a punch is
    // never shown in the reader's own zone.
    expect(formatClock(new Date('2026-03-09T21:30:00Z'), 'Asia/Karachi')).toBe(
      '02:30',
    );
  });
});

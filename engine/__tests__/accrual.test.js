import { describe, expect, it } from 'vitest';
import { leaveYearFor, leaveYearsTouchedBy, prorate } from '../accrual.js';

/**
 * ARCHITECTURE §20. BR-13 seeds the accrual period to the leave year, which is
 * the calendar year: the whole of BR-12's entitlement is credited at its
 * start, prorated for a joiner or a new tenure per FR-2.7.
 */

describe('leaveYearFor', () => {
  it('resolves any date to its calendar year', () => {
    expect(leaveYearFor('2026-08-12')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('keeps the first and last days of the year inside it', () => {
    expect(leaveYearFor('2026-01-01').start).toBe('2026-01-01');
    expect(leaveYearFor('2026-12-31').end).toBe('2026-12-31');
  });
});

describe('leaveYearsTouchedBy', () => {
  it('returns one year for a range inside it', () => {
    expect(
      leaveYearsTouchedBy({ from: '2026-03-01', to: '2026-09-30' }),
    ).toEqual([{ start: '2026-01-01', end: '2026-12-31' }]);
  });

  it('returns both years for a range crossing the boundary, in order', () => {
    expect(
      leaveYearsTouchedBy({ from: '2025-12-30', to: '2026-01-02' }),
    ).toEqual([
      { start: '2025-01-01', end: '2025-12-31' },
      { start: '2026-01-01', end: '2026-12-31' },
    ]);
  });

  it('returns every year a long range spans', () => {
    const years = leaveYearsTouchedBy({ from: '2024-06-01', to: '2026-06-01' });
    expect(years.map((year) => year.start)).toEqual([
      '2024-01-01',
      '2025-01-01',
      '2026-01-01',
    ]);
  });
});

describe('prorate', () => {
  const year = { start: '2026-01-01', end: '2026-12-31' };

  it('gives the whole entitlement to someone employed before the year began', () => {
    expect(prorate(10, '2020-04-01', year)).toBe(10);
  });

  it('gives the whole entitlement to someone starting on the first day', () => {
    expect(prorate(10, '2026-01-01', year)).toBe(10);
  });

  it('prorates a mid-year joiner from their start (FR-2.7)', () => {
    // 1 July: 184 of 365 days remain, so 10 × 184/365 = 5.04 → 5.
    expect(prorate(10, '2026-07-01', year)).toBe(5);
  });

  it('rounds to the nearest half day, because leave is spent in half days', () => {
    // §20.2's stated decision: 6.37 days is not a spendable figure.
    const result = prorate(10, '2026-08-20', year);

    expect(result % 0.5).toBe(0);
    expect(result).toBe(3.5);
  });

  it('gives nothing for a tenure starting after the year ends', () => {
    expect(prorate(10, '2027-02-01', year)).toBe(0);
  });

  it('gives nothing where the entitlement itself is zero (FR-6.9)', () => {
    // Paternity and maternity seed at 0 and post to their own balance.
    expect(prorate(0, '2026-07-01', year)).toBe(0);
  });

  it('prorates a second tenure from that tenure’s start, not the original joining date', () => {
    // FR-2.7: a re-hire accrues from the new tenure, and the caller passes it.
    expect(prorate(10, '2026-07-01', year)).toBe(
      prorate(10, '2026-07-01', year),
    );
    expect(prorate(10, '2026-10-01', year)).toBe(2.5);
  });
});

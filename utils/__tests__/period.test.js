import { describe, expect, it } from 'vitest';
import { PERIOD_MODE } from '../../constants/index.js';
import {
  periodFromSearchParams,
  periodLabel,
  resolvePeriod,
  shiftPeriod,
} from '../period.js';

/**
 * The Weekly / Monthly / Custom filter both new pages share.
 *
 * The anchor is stored rather than the resolved range: a stored range cannot
 * be stepped forward without re-deriving which week or month it was, and two
 * screens deriving that differently is how "next week" starts meaning two
 * different things.
 */

describe('resolvePeriod', () => {
  it('resolves a week from Monday to Sunday', () => {
    const period = resolvePeriod({
      mode: PERIOD_MODE.WEEKLY,
      anchor: '2026-08-19',
    });

    // Wednesday's week, not the seven days around Wednesday.
    expect(period.from).toBe('2026-08-17');
    expect(period.to).toBe('2026-08-23');
  });

  it('resolves a month from its first date to its last', () => {
    const period = resolvePeriod({
      mode: PERIOD_MODE.MONTHLY,
      anchor: '2026-08-19',
    });

    expect(period.from).toBe('2026-08-01');
    expect(period.to).toBe('2026-08-31');
  });

  it('leaves a custom range exactly as given', () => {
    const period = resolvePeriod({
      mode: PERIOD_MODE.CUSTOM,
      from: '2026-08-16',
      to: '2026-09-15',
    });

    expect(period.from).toBe('2026-08-16');
    expect(period.to).toBe('2026-09-15');
  });

  it('rejects an unknown mode rather than guessing one', () => {
    expect(() => resolvePeriod({ mode: 'FORTNIGHTLY' })).toThrow(/FORTNIGHTLY/);
  });

  it('rejects a custom range that ends before it starts', () => {
    expect(() =>
      resolvePeriod({
        mode: PERIOD_MODE.CUSTOM,
        from: '2026-09-15',
        to: '2026-08-16',
      }),
    ).toThrow(/before/i);
  });
});

describe('shiftPeriod', () => {
  it('steps a week at a time', () => {
    expect(
      shiftPeriod({ mode: PERIOD_MODE.WEEKLY, anchor: '2026-08-19' }, 1).anchor,
    ).toBe('2026-08-24');
    expect(
      shiftPeriod({ mode: PERIOD_MODE.WEEKLY, anchor: '2026-08-19' }, -1)
        .anchor,
    ).toBe('2026-08-10');
  });

  it('steps a month at a time, landing on its first date', () => {
    expect(
      shiftPeriod({ mode: PERIOD_MODE.MONTHLY, anchor: '2026-08-19' }, 1)
        .anchor,
    ).toBe('2026-09-01');
  });

  it('steps a custom range by its own length, so the two never overlap', () => {
    const next = shiftPeriod(
      { mode: PERIOD_MODE.CUSTOM, from: '2026-08-01', to: '2026-08-07' },
      1,
    );

    expect(next.from).toBe('2026-08-08');
    expect(next.to).toBe('2026-08-14');
  });
});

describe('periodLabel', () => {
  it('names a month', () => {
    expect(
      periodLabel({ mode: PERIOD_MODE.MONTHLY, anchor: '2026-08-19' }),
    ).toBe('August 2026');
  });

  it('names a week by both its ends', () => {
    expect(
      periodLabel({ mode: PERIOD_MODE.WEEKLY, anchor: '2026-08-19' }),
    ).toBe('17 – 23 August 2026');
  });

  it('names a week that crosses a month boundary on both months', () => {
    expect(
      periodLabel({ mode: PERIOD_MODE.WEEKLY, anchor: '2026-08-31' }),
    ).toBe('31 August – 6 September 2026');
  });

  it('names a custom range by both its ends', () => {
    expect(
      periodLabel({
        mode: PERIOD_MODE.CUSTOM,
        from: '2026-08-16',
        to: '2026-09-15',
      }),
    ).toBe('16 August – 15 September 2026');
  });
});

describe('periodFromSearchParams', () => {
  it('opens on the current month when nothing is asked for', () => {
    const period = periodFromSearchParams({}, { today: '2026-08-19' });

    expect(period.mode).toBe(PERIOD_MODE.MONTHLY);
    expect(period.from).toBe('2026-08-01');
    expect(period.to).toBe('2026-08-31');
  });

  it('reads the mode and anchor a link carries', () => {
    const period = periodFromSearchParams(
      { mode: PERIOD_MODE.WEEKLY, anchor: '2026-08-19' },
      { today: '2026-01-01' },
    );

    expect(period.from).toBe('2026-08-17');
  });

  it('falls back to the current month when the mode is nonsense', () => {
    // A hand-edited URL is a wrong input, not a crash: the filter is a view of
    // the data, and refusing to render one is worse than showing this month.
    const period = periodFromSearchParams(
      { mode: 'FORTNIGHTLY' },
      { today: '2026-08-19' },
    );

    expect(period.mode).toBe(PERIOD_MODE.MONTHLY);
    expect(period.from).toBe('2026-08-01');
  });

  it('falls back to the current month when a custom range is back to front', () => {
    const period = periodFromSearchParams(
      { mode: PERIOD_MODE.CUSTOM, from: '2026-09-15', to: '2026-08-16' },
      { today: '2026-08-19' },
    );

    expect(period.mode).toBe(PERIOD_MODE.MONTHLY);
    expect(period.from).toBe('2026-08-01');
  });

  it('reads a bare from and to as a custom range, so an old link keeps its dates', () => {
    // `/reports?from=&to=` redirects to `/attendance` carrying its query. The
    // range was the whole point of that link; defaulting it to this month
    // would silently answer a different question from the one asked.
    const period = periodFromSearchParams(
      { from: '2026-08-16', to: '2026-09-15' },
      { today: '2026-01-01' },
    );

    expect(period.mode).toBe(PERIOD_MODE.CUSTOM);
    expect(period.from).toBe('2026-08-16');
    expect(period.to).toBe('2026-09-15');
  });

  it('carries the period back out as the query a link needs', () => {
    const period = periodFromSearchParams(
      { mode: PERIOD_MODE.WEEKLY, anchor: '2026-08-19' },
      { today: '2026-01-01' },
    );

    expect(period.query).toEqual({
      mode: PERIOD_MODE.WEEKLY,
      anchor: '2026-08-17',
    });
  });
});

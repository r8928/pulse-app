import { describe, expect, it } from 'vitest';
import {
  deriveEmploymentDates,
  isWithinEmploymentPeriod,
} from '../employment.js';

/**
 * FR-2.12 and DC-4. The employment period is derived from tenures and never
 * stored. Date of joining and date of leaving are the deliberate exception:
 * they are stored on the user because every screen and report reads them — so
 * every operation that touches a tenure must rewrite both in the same step,
 * and this is the function that works out what they should be.
 */

const tenure = (startDate, endDate = null, deletedAt = null) => ({
  startDate,
  endDate,
  deletedAt,
});

describe('deriveEmploymentDates', () => {
  it('takes joining from the only tenure and leaves leaving empty while it is open', () => {
    expect(deriveEmploymentDates([tenure('2026-01-15')])).toEqual({
      dateOfJoining: '2026-01-15',
      dateOfLeaving: null,
    });
  });

  it('sets leaving from a closed tenure', () => {
    expect(deriveEmploymentDates([tenure('2026-01-15', '2026-08-03')])).toEqual(
      {
        dateOfJoining: '2026-01-15',
        dateOfLeaving: '2026-08-03',
      },
    );
  });

  it('keeps joining at the earliest tenure after a re-hire', () => {
    // FR-2.3: a re-hire leaves the date of joining unchanged, since that
    // remains the date they first joined.
    expect(
      deriveEmploymentDates([
        tenure('2026-01-15', '2026-08-03'),
        tenure('2026-11-05'),
      ]),
    ).toEqual({ dateOfJoining: '2026-01-15', dateOfLeaving: null });
  });

  it('takes leaving from the most recent closed tenure when none is open', () => {
    expect(
      deriveEmploymentDates([
        tenure('2020-01-01', '2021-06-30'),
        tenure('2026-01-15', '2026-08-03'),
      ]),
    ).toEqual({ dateOfJoining: '2020-01-01', dateOfLeaving: '2026-08-03' });
  });

  it('is order independent, since tenures arrive in no guaranteed order', () => {
    expect(
      deriveEmploymentDates([
        tenure('2026-11-05'),
        tenure('2026-01-15', '2026-08-03'),
      ]),
    ).toEqual({ dateOfJoining: '2026-01-15', dateOfLeaving: null });
  });

  it('ignores soft deleted tenures', () => {
    expect(
      deriveEmploymentDates([
        tenure('2020-01-01', '2021-06-30', '2026-02-01T00:00:00.000Z'),
        tenure('2026-01-15'),
      ]),
    ).toEqual({ dateOfJoining: '2026-01-15', dateOfLeaving: null });
  });

  it('returns both empty when every tenure is soft deleted', () => {
    expect(
      deriveEmploymentDates([
        tenure('2026-01-15', null, '2026-02-01T00:00:00.000Z'),
      ]),
    ).toEqual({ dateOfJoining: null, dateOfLeaving: null });
  });

  it('returns both empty for no tenures rather than throwing', () => {
    expect(deriveEmploymentDates([])).toEqual({
      dateOfJoining: null,
      dateOfLeaving: null,
    });
  });
});

describe('isWithinEmploymentPeriod', () => {
  it('admits a date inside an open tenure', () => {
    expect(isWithinEmploymentPeriod([tenure('2026-01-01')], '2026-08-12')).toBe(
      true,
    );
  });

  it('refuses a date before the tenure starts', () => {
    expect(isWithinEmploymentPeriod([tenure('2026-09-01')], '2026-08-12')).toBe(
      false,
    );
  });

  it('refuses a date after a closed tenure ends', () => {
    expect(
      isWithinEmploymentPeriod(
        [tenure('2026-01-01', '2026-08-03')],
        '2026-08-12',
      ),
    ).toBe(false);
  });

  it('refuses a date in the gap between two tenures', () => {
    expect(
      isWithinEmploymentPeriod(
        [tenure('2026-01-01', '2026-08-03'), tenure('2026-11-05')],
        '2026-09-15',
      ),
    ).toBe(false);
  });

  it('admits the first day of a tenure, which is inclusive', () => {
    expect(isWithinEmploymentPeriod([tenure('2026-01-01')], '2026-01-01')).toBe(
      true,
    );
  });

  it('admits the last day of a tenure, which is inclusive', () => {
    expect(
      isWithinEmploymentPeriod(
        [tenure('2026-01-01', '2026-08-03')],
        '2026-08-03',
      ),
    ).toBe(true);
  });

  it('ignores soft deleted tenures', () => {
    expect(
      isWithinEmploymentPeriod(
        [tenure('2026-01-01', null, '2026-02-01T00:00:00.000Z')],
        '2026-08-12',
      ),
    ).toBe(false);
  });

  it('refuses every date when there are no tenures', () => {
    expect(isWithinEmploymentPeriod([], '2026-08-12')).toBe(false);
  });
});

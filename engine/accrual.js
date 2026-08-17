import {
  differenceInCalendarDays,
  endOfYear,
  format,
  getYear,
  parseISO,
  startOfYear,
} from 'date-fns';

/**
 * §20. Accrual, proration and the leave year.
 *
 * Pure: no storage, no clock. `BR-13` seeds the accrual period to the leave
 * year, which is the calendar year, and the whole of `BR-12`'s entitlement is
 * credited at its start.
 *
 * Where a team accrues over a shorter period, `BR-13` requires the per-period
 * figure to be DERIVED from that team's annual entitlement rather than stored,
 * so changing the entitlement changes the accrual with no code change. Only
 * the seeded leave-year period is implemented here; a shorter one divides the
 * same annual figure and needs no new constant.
 */

const iso = (date) => format(date, 'yyyy-MM-dd');

/** The leave year a date falls in. */
export function leaveYearFor(date) {
  const on = parseISO(date);

  return { start: iso(startOfYear(on)), end: iso(endOfYear(on)) };
}

/**
 * Every leave year a range touches, oldest first.
 *
 * `recalculateDays` uses this to work out which years to credit before it
 * iterates (`D-12`) — a range crossing New Year touches two, and crediting
 * only one of them would leave the other year's balance short.
 */
export function leaveYearsTouchedBy({ from, to }) {
  const firstYear = getYear(parseISO(from));
  const lastYear = getYear(parseISO(to));

  const years = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    years.push(leaveYearFor(`${year}-01-01`));
  }

  return years;
}

/**
 * §20.2, FR-2.7. A joiner is prorated from their date of joining; a second or
 * later tenure prorates from THAT tenure's start, which is what the caller
 * passes.
 *
 * Rounded to the nearest half day. `spec.md` does not state the rounding, and
 * §20.2 records the decision: leave is transacted in half days (`BR-11`,
 * `FR-5.2`), so a figure like 6.37 is not spendable. `OFFICE_ADMIN` may
 * override the result through `P-20`.
 */
export function prorate(annualEntitlement, tenureStart, leaveYear) {
  if (annualEntitlement === 0) return 0;
  if (tenureStart > leaveYear.end) return 0;

  const start = tenureStart > leaveYear.start ? tenureStart : leaveYear.start;

  // Both ends inclusive: someone's first day is a day they were employed.
  const remaining =
    differenceInCalendarDays(parseISO(leaveYear.end), parseISO(start)) + 1;
  const total =
    differenceInCalendarDays(
      parseISO(leaveYear.end),
      parseISO(leaveYear.start),
    ) + 1;

  return Math.round((annualEntitlement * remaining * 2) / total) / 2;
}

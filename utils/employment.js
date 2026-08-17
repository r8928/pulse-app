import { isAfter, isBefore, parseISO, startOfDay } from 'date-fns';

/**
 * Employment period arithmetic over a user's tenures.
 *
 * FR-2.12 and DC-4: the employment period itself is derived and never stored.
 * Date of joining and date of leaving are the deliberate exception — they are
 * stored on the user because every screen, report, form and import reads them.
 * The rule that keeps them honest is that every operation which creates,
 * edits, closes, soft deletes or restores a tenure writes both in the same
 * step, using `deriveEmploymentDates`, so neither can drift.
 */

const toDate = (value) =>
  startOfDay(typeof value === 'string' ? parseISO(value) : value);

const live = (tenures) => (tenures ?? []).filter((tenure) => !tenure.deletedAt);

/** Both ends inclusive: someone's first and last day are days they worked. */
const covers = (tenure, date) => {
  if (isBefore(date, toDate(tenure.startDate))) return false;
  if (!tenure.endDate) return true;
  return !isAfter(date, toDate(tenure.endDate));
};

/**
 * Works out the two stored attributes from the tenures they must stay in step
 * with.
 *
 * Date of joining is the earliest tenure's start — unchanged by a re-hire,
 * since that remains the date they first joined (FR-2.3). Date of leaving is
 * the most recent closed tenure's end, and is empty whenever any tenure is
 * still open. The two are worked out independently, per FR-2.6.
 */
export function deriveEmploymentDates(tenures) {
  const active = live(tenures);

  if (active.length === 0) {
    return { dateOfJoining: null, dateOfLeaving: null };
  }

  const starts = active.map((tenure) => tenure.startDate).sort();
  const dateOfJoining = starts[0];

  const hasOpenTenure = active.some((tenure) => !tenure.endDate);
  if (hasOpenTenure) {
    return { dateOfJoining, dateOfLeaving: null };
  }

  const ends = active.map((tenure) => tenure.endDate).sort();
  return { dateOfJoining, dateOfLeaving: ends.at(-1) };
}

/**
 * Whether a date falls inside the employment period — that is, inside any one
 * non-soft-deleted tenure. A date in the gap between two tenures is outside it
 * and carries no day record, exception or deduction (FR-2.12).
 */
export function isWithinEmploymentPeriod(tenures, date) {
  const on = toDate(date);
  return live(tenures).some((tenure) => covers(tenure, on));
}

/**
 * FR-2.11's check, pure. Which of a user's dated records fall outside the
 * employment period a set of tenures produces — nothing more. What to do with
 * them is `engine/reduction.js`'s decision and `OFFICE_ADMIN`'s approval.
 *
 * A record with no date belongs to no day yet — an imported punch before its
 * work date is resolved — and cannot be stranded: the engine never assigns a
 * work date outside the period in the first place.
 */
export function recordsOutsidePeriod(tenures, records) {
  return (records ?? []).filter(
    (record) => record.date && !isWithinEmploymentPeriod(tenures, record.date),
  );
}

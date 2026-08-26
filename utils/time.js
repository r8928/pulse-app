import { format, isValid, parse, startOfToday } from 'date-fns';

/**
 * The shape a clock time is stored in: `HH:mm`, what a `type='time'` input
 * yields and what sorts correctly inside a query.
 */
const STORED_FORMAT = 'HH:mm';

/**
 * A stored clock time rendered on the 12-hour clock — `09:00` as `9:00 AM`.
 *
 * The office does not say "nineteen hundred". Storage keeps the 24-hour form
 * because it sorts and compares; only the reading changes here, so nothing
 * downstream of a shift sees a different value.
 *
 * `date-fns` does the conversion rather than arithmetic on the string, per
 * `CLAUDE.md`: the two cases hand-rolled code gets wrong are midnight and
 * noon, where `hour % 12` yields 0 rather than 12. `startOfToday()` supplies
 * the reference date `parse` requires without a `new Date()` of our own — only
 * the time-of-day is read back out of it, so which day it lands on is
 * immaterial.
 *
 * An unparseable value is handed back untouched. A shift row may be rendered
 * before `FR-3.3` has been configured for that team, and a cell reading
 * "Invalid Date" tells the reader less than the raw value does (`DC-6`).
 *
 * @param {string | null | undefined} value a clock time as `HH:mm`
 * @returns {string} the same time as `h:mm AM/PM`, or the input unchanged
 */
export function formatClockTime(value) {
  if (!value) return '';

  const parsed = parse(value, STORED_FORMAT, startOfToday());

  return isValid(parsed) ? format(parsed, 'h:mm a') : value;
}

import { addMinutes } from 'date-fns';
import { HALF_DAY_PERIOD } from '../constants/index.js';

/**
 * D-11 (docs/superpowers/specs/2026-08-13-phase-5-design.md). Determines the
 * effective check window and required minutes for the lateness/short-day
 * test, adjusted when the date is a half-day LEAVE.
 *
 * Assumes the shift's published window span equals its required minutes —
 * true of every seeded shift and the only shape the schema currently
 * supports (no separate unpaid-break concept exists).
 *
 * A FULL-day LEAVE has no worked half to check at all — the caller must not
 * call this (or must skip the ladder outright) when the day's status is
 * LEAVE with `amount: 1`. This function only handles the half-day case.
 *
 * @param {{ start: Date, end: Date, requiredDailyMinutes: number }} shiftRequirement
 *   `start`/`end` from `shiftWindow(shift, workDate)`, combined with
 *   `requiredDailyMinutes` from the shift object — not `shiftWindow`'s
 *   return value directly, which carries no `requiredDailyMinutes`.
 * @param {'MORNING'|'AFTERNOON'|null} halfDayPeriod
 * @returns {{ checkStart: Date, checkEnd: Date, requiredMinutes: number }}
 */
export function effectiveRequirement(
  { start, end, requiredDailyMinutes },
  halfDayPeriod,
) {
  if (!halfDayPeriod) {
    return {
      checkStart: start,
      checkEnd: end,
      requiredMinutes: requiredDailyMinutes,
    };
  }

  const halfMinutes = requiredDailyMinutes / 2;
  const midpoint = addMinutes(start, halfMinutes);

  if (halfDayPeriod === HALF_DAY_PERIOD.AFTERNOON) {
    // Leave in the afternoon: worked the morning, checked from the normal
    // shift start through the midpoint.
    return {
      checkStart: start,
      checkEnd: midpoint,
      requiredMinutes: halfMinutes,
    };
  }

  // MORNING is leave: worked the afternoon, so the check window starts at
  // the shift's midpoint instead of its published start.
  return { checkStart: midpoint, checkEnd: end, requiredMinutes: halfMinutes };
}

/**
 * §17. Lateness is measured from the effective check-window start — the
 * shift's own start on an ordinary day, or `effectiveRequirement`'s
 * half-day-adjusted one. `null` (no check-in at all) is 0, not "infinitely
 * late" — the day's ABSENT status is what carries that meaning.
 */
export function lateMinutes(firstCheckIn, checkStart) {
  if (!firstCheckIn) return 0;
  return Math.max(0, (firstCheckIn.getTime() - checkStart.getTime()) / 60000);
}

/** §17. The mirror of `lateMinutes` at the other end of the check window. */
export function earlyMinutes(lastCheckOut, checkEnd) {
  if (!lastCheckOut) return 0;
  return Math.max(0, (checkEnd.getTime() - lastCheckOut.getTime()) / 60000);
}

/**
 * §17.1, BR-6/BR-7: compliant if arrival is at or before the shift start
 * plus its grace period. Grace decides compliance; it is never subtracted
 * from `lateMinutes` itself.
 */
export function isCompliant(lateMins, graceMinutes) {
  return lateMins <= graceMinutes;
}

/** BR-5: short if less than `thresholdPercent` of the required duration was clocked. */
export function isShortDay(workedMins, requiredMinutes, thresholdPercent) {
  return workedMins < (requiredMinutes * thresholdPercent) / 100;
}

/** §17.2: both ladder tests share `requiredMinutes` as their denominator. */
export function latenessPercent(lateMins, requiredMinutes) {
  return (lateMins / requiredMinutes) * 100;
}

/** §17.2: the clocked-side counterpart to `latenessPercent`. */
export function clockedPercent(workedMins, requiredMinutes) {
  return (workedMins / requiredMinutes) * 100;
}

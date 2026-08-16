import {
  addDays,
  addMilliseconds,
  format,
  parseISO,
  subDays,
  subMilliseconds,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { EXCEPTION_CODE } from '../constants/index.js';

/**
 * §13.2. Resolves a shift's start and end to absolute UTC instants for one
 * work date, honouring the daylight-saving offset in force on EACH end
 * independently (FR-3.11: a transition day is 23 or 25 hours, not 24 —
 * never computed as `start + requiredDailyMinutes`).
 */

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function crossesMidnight(shift) {
  return shift.endTime <= shift.startTime;
}

/**
 * Resolves one local wall-clock instant to UTC, rejecting a spring-forward
 * time that never happened (§13.3, FR-3.11, invariant I-5).
 *
 * Fall back (ambiguous) is handled correctly by `fromZonedTime` alone: it
 * resolves an ambiguous local time using the PRE-transition offset, which is
 * the FIRST of the two occurrences. Verified against date-fns-tz's own
 * documented example: America/New_York 2014-11-02 01:30 resolves to 05:30
 * UTC (EDT, first), not 06:30 UTC (EST, second). Nothing extra is needed for
 * that direction.
 *
 * Spring forward (nonexistent) is NOT rejected by the library — it silently
 * returns some instant for a local time that never existed. Round-tripping
 * that instant back through `toZonedTime` and comparing is date-fns-tz's own
 * documented pattern for detecting this.
 */
function resolveLocalInstant(localDateTimeString, timezone) {
  const instant = fromZonedTime(localDateTimeString, timezone);
  const roundTrip = format(toZonedTime(instant, timezone), LOCAL_FORMAT);
  return roundTrip === localDateTimeString ? instant : null;
}

/**
 * @param {{ startTime: string, endTime: string, timezone: string }} shift
 * @param {string} workDate 'YYYY-MM-DD'
 * @returns {{ start: Date, end: Date, invalidField: null }
 *         | { start: Date|null, end: Date|null, invalidField: 'start'|'end' }}
 */
export function shiftWindow(shift, workDate) {
  const startLocal = `${workDate}T${shift.startTime}`;
  const endDateStr = crossesMidnight(shift)
    ? format(addDays(parseISO(workDate), 1), 'yyyy-MM-dd')
    : workDate;
  const endLocal = `${endDateStr}T${shift.endTime}`;

  const start = resolveLocalInstant(startLocal, shift.timezone);
  const end = resolveLocalInstant(endLocal, shift.timezone);

  if (start === null) return { start: null, end, invalidField: 'start' };
  if (end === null) return { start, end: null, invalidField: 'end' };
  return { start, end, invalidField: null };
}

const HOUR_MS = 3600000;
const CANDIDATE_SPAN_HOURS = 48;

function localDateIn(instant, timezone) {
  return format(toZonedTime(instant, timezone), 'yyyy-MM-dd');
}

/**
 * §13.1. Resolves which work date a punch belongs to by searching, not
 * assuming: the shift needed to answer the question is itself what the
 * question is about. `shiftAssignments` may be a user's whole history (or
 * any superset covering the punch) — filtering to the plausible window is
 * this function's job, not the caller's.
 *
 * @param {Date} punchInstant
 * @param {Array<{ effectiveFrom: string, effectiveTo: string|null, shift: object }>} shiftAssignments
 * @returns {{ workDate: string, exceptionCode: null } | { workDate: null, exceptionCode: string }}
 */
export function resolveWorkDate(punchInstant, shiftAssignments) {
  const spanStart = subMilliseconds(
    punchInstant,
    CANDIDATE_SPAN_HOURS * HOUR_MS,
  );
  const spanEnd = addMilliseconds(punchInstant, CANDIDATE_SPAN_HOURS * HOUR_MS);

  const candidates = shiftAssignments.filter((assignment) => {
    const from = parseISO(assignment.effectiveFrom);
    const to = assignment.effectiveTo ? parseISO(assignment.effectiveTo) : null;
    return from <= spanEnd && (to === null || to >= spanStart);
  });

  if (candidates.length === 0) {
    return { workDate: null, exceptionCode: EXCEPTION_CODE.NO_SHIFT_ASSIGNED };
  }

  let anyConfigured = false;
  const matches = [];

  for (const assignment of candidates) {
    const { shift } = assignment;
    if (
      shift.crossingWindowHours === null ||
      shift.crossingWindowHours === undefined
    ) {
      continue; // §8.3: unconfigured — this candidate's window cannot be searched at all
    }
    anyConfigured = true;

    const sameDay = localDateIn(punchInstant, shift.timezone);
    const dayBefore = format(subDays(parseISO(sameDay), 1), 'yyyy-MM-dd');

    for (const workDate of [sameDay, dayBefore]) {
      const { start, end, invalidField } = shiftWindow(shift, workDate);
      if (invalidField) continue;

      const inRaw = punchInstant >= start && punchInstant <= end;

      const crossingMs = shift.crossingWindowHours * HOUR_MS;
      const widenedStart = subMilliseconds(start, crossingMs);
      const widenedEnd = addMilliseconds(end, crossingMs);
      const inWidened =
        punchInstant >= widenedStart && punchInstant <= widenedEnd;

      if (inRaw || inWidened) {
        matches.push({ assignment, workDate, widened: !inRaw });
      }
    }
  }

  if (matches.length === 0) {
    return {
      workDate: null,
      exceptionCode: anyConfigured
        ? EXCEPTION_CODE.PUNCH_OUTSIDE_SHIFT_WINDOW
        : EXCEPTION_CODE.SHIFT_CONFIGURATION_INCOMPLETE,
    };
  }

  // §13.1: on the day an assignment changes, more than one candidate can
  // match — and because the crossing buffer widens generously in both
  // directions, one of the two matches is often only reachable through that
  // buffer while the other fits the shift's ordinary window outright. A
  // match that needed no widening is the stronger signal, so it wins first;
  // only among ties does the algorithm's stated tie-break apply — prefer
  // whichever assignment's own effective range covers the date it resolved
  // to.
  const tightMatches = matches.filter((match) => !match.widened);
  const bestMatches = tightMatches.length > 0 ? tightMatches : matches;

  const covering = bestMatches.find(({ assignment, workDate }) => {
    const from = assignment.effectiveFrom;
    const to = assignment.effectiveTo;
    return from <= workDate && (to === null || to >= workDate);
  });

  return {
    workDate: (covering ?? bestMatches[0]).workDate,
    exceptionCode: null,
  };
}

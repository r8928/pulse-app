import { EXCEPTION_CODE, PUNCH_TYPE } from '../constants/index.js';

/**
 * FR-4.7, §14.1/§14.2. Flags punches of the same type, same user, same work
 * date, within `windowMinutes` of an earlier one of the same type as
 * duplicates — excluded from pairing, never deleted (invariant I-1).
 *
 * Pure: returns the set of punch ids to treat as duplicates. The caller
 * persists `isDuplicate` on the punch documents; nothing here mutates input.
 * `windowMinutes` is that team's `teamPolicy.duplicatePunchWindowMinutes`.
 *
 * @param {Array<{ _id: string, type: string, at: Date }>} punchesOnWorkDate
 * @param {number} windowMinutes
 * @returns {Set<string>} ids of the punches that are duplicates
 */
export function flagDuplicates(punchesOnWorkDate, windowMinutes) {
  const duplicates = new Set();
  const lastSeenOfType = new Map();
  const windowMs = windowMinutes * 60000;

  const sorted = [...punchesOnWorkDate].sort((a, b) => a.at - b.at);

  for (const punch of sorted) {
    const anchor = lastSeenOfType.get(punch.type);

    if (anchor && punch.at.getTime() - anchor.at.getTime() <= windowMs) {
      duplicates.add(punch._id);
      // The anchor stays as the first of the run, so a third close punch
      // compares against the first, not the second.
    } else {
      lastSeenOfType.set(punch.type, punch);
    }
  }

  return duplicates;
}

/**
 * §14.1. Pairs check-ins with check-outs on one work date, for one user.
 * Live punches only — not soft deleted, not flagged duplicate (FR-4.7).
 *
 * A missing counterpart is never treated as zero hours (FR-4.8, invariant
 * I-5): it becomes an exception and the day keeps whatever complete pairs
 * exist.
 *
 * @param {Array<{ _id, type, at: Date, deletedAt: Date|null, isDuplicate: boolean }>} punches
 * @returns {{ pairs: Array, exceptions: string[], livePunches: Array }}
 */
export function pairPunches(punches) {
  const livePunches = punches
    .filter((punch) => !punch.deletedAt && !punch.isDuplicate)
    .sort((a, b) => a.at - b.at);

  const pairs = [];
  const exceptions = [];
  let open = null;

  for (const punch of livePunches) {
    if (punch.type === PUNCH_TYPE.CHECK_IN) {
      if (open !== null) exceptions.push(EXCEPTION_CODE.MISSING_CHECK_OUT);
      open = punch;
    } else {
      if (open === null) {
        exceptions.push(EXCEPTION_CODE.MISSING_CHECK_IN);
      } else {
        pairs.push([open, punch]);
        open = null;
      }
    }
  }

  if (open !== null) exceptions.push(EXCEPTION_CODE.MISSING_CHECK_OUT);

  return { pairs, exceptions, livePunches };
}

/**
 * §14. The sum of all check-in to check-out intervals, in minutes. A pair
 * with a check-out earlier than its check-in contributes zero rather than a
 * negative number — `impossibleDurationExceptions` is what flags it.
 *
 * @param {Array<[{at: Date}, {at: Date}]>} pairs
 * @returns {number}
 */
export function workedMinutes(pairs) {
  return pairs.reduce((total, [inPunch, outPunch]) => {
    const minutes = (outPunch.at.getTime() - inPunch.at.getTime()) / 60000;
    return total + Math.max(0, minutes);
  }, 0);
}

/**
 * §14.2. An impossible duration: over 24 hours total, or any pair whose
 * check-out precedes the check-in it closes. `pairPunches` pairs mechanically
 * by type and order and does not itself judge validity — this is that
 * judgement, queued on S-05 in Phase 6 (FR-8.6).
 *
 * @param {Array<[{at: Date}, {at: Date}]>} pairs
 * @returns {string[]}
 */
export function impossibleDurationExceptions(pairs) {
  const hasBackwardsPair = pairs.some(
    ([inPunch, outPunch]) => outPunch.at < inPunch.at,
  );
  if (hasBackwardsPair) return [EXCEPTION_CODE.IMPOSSIBLE_DURATION];

  if (workedMinutes(pairs) > 24 * 60)
    return [EXCEPTION_CODE.IMPOSSIBLE_DURATION];

  return [];
}

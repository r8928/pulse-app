import { parseISO } from 'date-fns';
import { PUNCH_TYPE } from '../../constants/index.js';
import { formatClock } from '../../utils/duration.js';

/**
 * A punch's instant, whichever form it arrived in. A server component may hand
 * over a Date; JSON from a route hands over a string. `parseISO` rather than
 * `new Date()` for the string case (CLAUDE.md).
 */
export const toInstant = (value) =>
  value instanceof Date ? value : parseISO(value);

/**
 * The punch pairs of one day, as `09:02 → 18:04` in the shift's own timezone.
 *
 * A check-in with no counterpart reads `09:02 → —` rather than being dropped:
 * FR-4.8 and I-5 say a missing punch is never treated as zero hours, and the
 * screen has to say the same thing the engine did.
 *
 * Duplicates and soft-deleted punches are excluded here exactly as the engine
 * excludes them from pairing (FR-4.7) — S-12 is where they are listed and
 * explained.
 */
export function punchPairLabels(punches, timezone) {
  const live = punches
    .filter((punch) => !punch.deletedAt && !punch.isDuplicate)
    .sort((a, b) => toInstant(a.at) - toInstant(b.at));

  const labels = [];
  let open = null;

  for (const punch of live) {
    if (punch.type === PUNCH_TYPE.CHECK_IN) {
      if (open) labels.push(`${formatClock(toInstant(open.at), timezone)} → —`);
      open = punch;
    } else if (open) {
      labels.push(
        `${formatClock(toInstant(open.at), timezone)} → ${formatClock(toInstant(punch.at), timezone)}`,
      );
      open = null;
    } else {
      labels.push(`— → ${formatClock(toInstant(punch.at), timezone)}`);
    }
  }

  if (open) labels.push(`${formatClock(toInstant(open.at), timezone)} → —`);

  return labels;
}

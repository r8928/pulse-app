import { EXCEPTION_CODE } from '../constants/index.js';

/**
 * FR-8.6, §27.1. What each exception code says to a reader.
 *
 * The codes are the engine's vocabulary; these are the words a person reads on
 * S-10, S-12 and — from Phase 6 — the S-05 queues. Written once so the same
 * condition is never described two different ways on two screens.
 */
const LABELS = Object.freeze({
  [EXCEPTION_CODE.NO_SHIFT_ASSIGNED]:
    'No shift assigned for this date, so nothing can be classified',
  [EXCEPTION_CODE.PUNCH_OUTSIDE_SHIFT_WINDOW]:
    'A punch falls outside every shift window',
  [EXCEPTION_CODE.SHIFT_CONFIGURATION_INCOMPLETE]:
    'Required configuration is not set for this team',
  [EXCEPTION_CODE.MISSING_CHECK_IN]: 'Missing check in',
  [EXCEPTION_CODE.MISSING_CHECK_OUT]: 'Missing check out',
  [EXCEPTION_CODE.IMPOSSIBLE_DURATION]:
    'An impossible duration — over 24 hours, or out before in',
});

/**
 * DC-6: an unrecognised code is shown as itself rather than hidden. A silently
 * dropped exception is worse than an ugly one.
 */
export function exceptionLabel(code) {
  return LABELS[code] ?? code;
}

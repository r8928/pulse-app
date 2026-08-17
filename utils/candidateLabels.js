import { MANUAL_GRANT } from '../constants/index.js';

/**
 * How S-15 and its popups name a candidate's two facts: what produced it, and
 * how much it is worth.
 *
 * `MANUAL_GRANT` is a sentinel, not a ladder row — printing it raw would send
 * a reader looking for a `BR-` rule that does not exist (`FR-7.6`).
 */
export function ruleLabel(rule) {
  return rule === MANUAL_GRANT ? 'Manual grant' : rule;
}

/** Half days are the smallest unit anywhere in Pulse, so "0.5 days" is normal. */
export function dayLabel(amount) {
  return `${amount} ${amount === 1 ? 'day' : 'days'}`;
}

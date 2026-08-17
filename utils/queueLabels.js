import { EXCEPTION_QUEUE } from '../constants/index.js';

/**
 * §27.1's table as words. `S-05`'s tabs and `S-04`'s tiles both read these, so
 * the same queue is never described two different ways on two screens.
 *
 * `DC-11` forbids an unexplained abbreviation, which is why each is a full
 * phrase rather than a code.
 */
const LABELS = Object.freeze({
  [EXCEPTION_QUEUE.MISSING_PUNCH]: 'Missing check in or check out',
  [EXCEPTION_QUEUE.DUPLICATE_PUNCH]: 'Duplicate punch',
  [EXCEPTION_QUEUE.IMPOSSIBLE_DURATION]: 'Impossible duration',
  [EXCEPTION_QUEUE.NO_SHIFT]: 'Date with no shift assigned',
  [EXCEPTION_QUEUE.CONFIGURATION]: 'Required configuration not set',
  [EXCEPTION_QUEUE.IMPORT_ROW]: 'Unmatched import row',
  [EXCEPTION_QUEUE.LATE_ARRIVAL]: 'Unresolved late arrival',
  [EXCEPTION_QUEUE.EXHAUSTED_BALANCE]: 'Exhausted leave or PTO balance',
  [EXCEPTION_QUEUE.PTO_EXPIRING]: 'PTO approaching expiry',
  [EXCEPTION_QUEUE.PTO_PENDING]: 'PTO awaiting approval',
  [EXCEPTION_QUEUE.CTO_PENDING]: 'CTO awaiting approval',
  [EXCEPTION_QUEUE.REDUCTION]: 'Employment-period reduction',
});

/** What an empty queue means, which is never the same thing twice. */
const NOTHING_OUTSTANDING = Object.freeze({
  [EXCEPTION_QUEUE.MISSING_PUNCH]:
    'Every day in this range has both a check in and a check out.',
  [EXCEPTION_QUEUE.DUPLICATE_PUNCH]:
    'No punch in this range is flagged as a duplicate of another.',
  [EXCEPTION_QUEUE.IMPOSSIBLE_DURATION]:
    'No day in this range works out to over 24 hours or to a check out before its check in.',
  [EXCEPTION_QUEUE.NO_SHIFT]:
    'Every date in this range resolved to a shift, so every day could be classified.',
  [EXCEPTION_QUEUE.CONFIGURATION]:
    'Every team has every value the engine needs. Nothing is being guessed.',
  [EXCEPTION_QUEUE.IMPORT_ROW]:
    'Every row of every committed import matched a user.',
  [EXCEPTION_QUEUE.LATE_ARRIVAL]:
    'No lateness in this range is still costing leave that nobody has looked at.',
  [EXCEPTION_QUEUE.EXHAUSTED_BALANCE]:
    'No balance has gone below zero in this range.',
  [EXCEPTION_QUEUE.PTO_EXPIRING]:
    'No approved award is close enough to its expiry to warn about.',
  [EXCEPTION_QUEUE.PTO_PENDING]: 'Every PTO award raised has been decided.',
  [EXCEPTION_QUEUE.CTO_PENDING]:
    'Every CTO application raised has been decided.',
  [EXCEPTION_QUEUE.REDUCTION]:
    'No change has left a record outside somebody’s employment period.',
});

export function queueLabel(queue) {
  return LABELS[queue] ?? queue;
}

export function nothingOutstanding(queue) {
  return NOTHING_OUTSTANDING[queue] ?? 'There is nothing in this queue.';
}

/** Tab order is §27.1's table order, which is roughly worst-first. */
export const QUEUE_ORDER = Object.freeze(Object.values(EXCEPTION_QUEUE));

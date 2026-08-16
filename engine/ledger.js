import { DAY_STATUS, LEDGER_ENTRY_TYPE } from '../constants/index.js';
import { effective } from '../utils/dayRecord.js';

/**
 * D-13. WFH is a plain count against the per-team quota (BR-16), not a pool
 * drawn from a deposit, so it receives no ENTITLEMENT_CREDIT. It replays
 * through the same sum as every other movement with this as its pseudo leave
 * type, which is what keeps FR-5.5's balance traceable on S-14 (NFR-11)
 * rather than becoming a special case that counts day-record statuses.
 */
export const WFH_LEAVE_TYPE = 'WFH';

/**
 * §19 and §23.3 step 9. What one day IMPLIES about the ledger — the desired
 * state, not a write. This file is pure and imports no storage.
 *
 * Reading `effective()` rather than `computed` is deliberate: §23.1 says that
 * where an override moves a balance, the movement posts in the normal way. A
 * human decision therefore moves the balance exactly as the engine's own
 * conclusion would.
 *
 * Amounts are signed (§19.1). Every entry here is a debit, so every one is
 * negative, and replay stays a plain sum with no per-type sign table to get
 * wrong.
 *
 * @param {{ dayRecord: object, policy: object, leaveRecord: object|null }} input
 * @returns {Array<{ entryType: string, leaveType: string, amount: number, rule: string }>}
 */
export function desiredEntriesForDay({ dayRecord, policy, leaveRecord }) {
  const entries = [];
  const dayStatus = effective(dayRecord, 'dayStatus');
  const deduction = effective(dayRecord, 'deduction') ?? 0;

  /**
   * BR-11. The type comes from the leave record, never from policy: the record
   * is what states which balance this day spends. A LEAVE status with no
   * record behind it implies nothing rather than guessing a type (DC-6).
   */
  if (dayStatus === DAY_STATUS.LEAVE && leaveRecord) {
    entries.push({
      entryType: LEDGER_ENTRY_TYPE.LEAVE_AVAILED,
      leaveType: leaveRecord.leaveType,
      amount: -leaveRecord.amount,
      rule: 'BR-11',
    });
  }

  if (dayStatus === DAY_STATUS.WFH) {
    entries.push({
      entryType: LEDGER_ENTRY_TYPE.WFH_USED,
      leaveType: WFH_LEAVE_TYPE,
      amount: -1,
      rule: 'BR-16',
    });
  }

  /**
   * FR-6.3: the engine raises a deduction with no type stated, so it posts to
   * the single type that team configures for automatic deductions.
   *
   * D-11: this runs ALONGSIDE a half-day LEAVE_AVAILED — both are real,
   * independent movements — and is absent on a full day of leave because the
   * ladder never ran there, having no worked half to check.
   */
  if (deduction > 0) {
    entries.push({
      entryType: LEDGER_ENTRY_TYPE.AUTOMATIC_DEDUCTION,
      leaveType: policy.automaticDeductionLeaveType,
      amount: -deduction,
      rule: effective(dayRecord, 'deductionRule'),
    });
  }

  return entries;
}

/** Two entries are the same effect when these three agree (D-17). */
const identity = (entry) =>
  `${entry.entryType}:${entry.leaveType}:${entry.amount}`;

/**
 * §23.3 step 9. Diffs what the day implies against what the ledger already
 * holds for it. Called with one day record's own entries and nothing else.
 *
 * D-17: the match is on effect — type, leave type and amount — not on the
 * source version. A version bump that leaves the movement identical must not
 * churn the ledger into cancelling pairs, because NFR-11 needs S-14 to stay
 * readable as an explanation of the number.
 *
 * An entry that is no longer implied is REVERSED, never removed (I-1,
 * FR-6.8). An entry already reversed does not count as present, so the day's
 * implication posts afresh.
 */
export function reconcileLedger({ desired, existing }) {
  const reversedIds = new Set(
    existing
      .filter((entry) => entry.reversalOf)
      .map((entry) => String(entry.reversalOf)),
  );

  const live = existing.filter(
    (entry) =>
      entry.entryType !== LEDGER_ENTRY_TYPE.REVERSAL &&
      !reversedIds.has(String(entry._id)),
  );

  const desiredKeys = new Set(desired.map(identity));
  const liveKeys = new Set(live.map(identity));

  return {
    toPost: desired.filter((entry) => !liveKeys.has(identity(entry))),
    toReverse: live.filter((entry) => !desiredKeys.has(identity(entry))),
  };
}

import { LEDGER_ENTRY_TYPE, MANUAL_GRANT } from '../constants/index.js';
import {
  getCtoApplicationById,
  getCtoApplicationForDate,
  getDayRecord,
  listLedgerEntriesForSource,
  markCtoApplicationApproved,
  markCtoApplicationDeclined,
  postLedgerEntries,
  replayBalance,
  reverseLedgerEntries,
  upsertCtoCandidate,
  ValidationError,
} from '../database.js';
import { ensurePtoExpiryPosted, PTO_LEAVE_TYPE } from './pto.js';

/**
 * §22, `D-23`, `BR-26`. Both movements post in the same operation, or
 * neither does: the `CTO_APPLIED` debit against PTO, and the reversal of
 * that day's `AUTOMATIC_DEDUCTION` — a CTO application that debits PTO
 * without cancelling the deduction charges the user twice (`§22.1`).
 *
 * The balance check counts unexpired awards only, so any award whose
 * expiry has passed but hasn't been swept yet is posted first — the same
 * "first thing that looks at a date past it" guard `approvePtoAward` and
 * `recalculateDays` already rely on (`D-24`).
 *
 * Insufficient balance without `override: true` refuses the write, naming
 * the shortfall (`D-23`). With `override: true` it proceeds and records
 * `blockOverridden: true`, itself audited (`FR-6.10`).
 */
export async function approveCtoApplication(
  id,
  { amount, reason, override = false },
  version,
  actor,
) {
  const before = await getCtoApplicationById(id);
  if (!before) return null;

  if (before.status !== 'PENDING') {
    throw new ValidationError(
      `This application is already ${before.status.toLowerCase()} and cannot be approved again.`,
    );
  }

  // `D-22`, as in `approvePtoAward`: a withdrawal leaves the record PENDING, so
  // the status test alone would let a retracted suggestion still spend PTO.
  if (before.withdrawn) {
    throw new ValidationError(
      'This day no longer qualifies for CTO, so the suggestion was withdrawn. Apply it manually if it is still owed.',
    );
  }

  await ensurePtoExpiryPosted(before.userId, actor);
  const available = await replayBalance(
    before.userId,
    PTO_LEAVE_TYPE,
    before.date,
  );
  const blockOverridden = available < amount;

  if (blockOverridden && !override) {
    throw new ValidationError(
      `Insufficient PTO balance to apply CTO: ${available} available, ${amount} requested. Approve with override to proceed.`,
    );
  }

  const after = await markCtoApplicationApproved(
    id,
    {
      status: 'APPROVED',
      appliedAmount: amount,
      blockOverridden,
      reason,
    },
    version,
    actor,
  );
  if (!after) return null;

  await postLedgerEntries(
    [
      {
        entryType: LEDGER_ENTRY_TYPE.CTO_APPLIED,
        leaveType: PTO_LEAVE_TYPE,
        amount: -amount,
        rule: after.rule,
      },
    ],
    {
      sourceType: 'ctoApplication',
      sourceId: id,
      sourceVersion: after.version,
      userId: after.userId,
      date: after.date,
      actor,
      reason,
    },
  );

  // BR-25 (did not attend at all) posts no deduction in the first place —
  // nothing to reverse, and that is correct, not a gap.
  const dayRecord = await getDayRecord(after.userId, after.date);
  if (dayRecord) {
    const dayEntries = await listLedgerEntriesForSource(
      'dayRecord',
      String(dayRecord._id),
    );
    const deduction = dayEntries.filter(
      (entry) => entry.entryType === LEDGER_ENTRY_TYPE.AUTOMATIC_DEDUCTION,
    );
    if (deduction.length > 0) {
      await reverseLedgerEntries(deduction, { actor, reason });
    }
  }

  return after;
}

/** Posts nothing; the snapshot is what `D-22` compares a re-proposal against. */
export async function declineCtoApplication(id, reason, version, actor) {
  const before = await getCtoApplicationById(id);
  if (!before) return null;

  if (before.status !== 'PENDING') {
    throw new ValidationError(
      `This application is already ${before.status.toLowerCase()} and cannot be declined.`,
    );
  }

  return markCtoApplicationDeclined(
    id,
    {
      status: 'DECLINED',
      declinedSnapshot: { rule: before.rule, amount: before.proposedAmount },
      reason,
    },
    version,
    actor,
  );
}

/**
 * For a user and date the engine raised no suggestion for — creates and
 * approves in one action, identified in the ledger as a manual grant.
 *
 * Always succeeds: an `OFFICE_ADMIN` manually granting CTO is already a
 * direct, audited override of the ordinary proposal flow, so `BR-26`'s
 * block does not additionally apply here — but the resulting record still
 * honestly reflects a real shortfall via `blockOverridden`, exactly as an
 * approval with `override: true` would.
 */
export async function originateCtoApplication(
  { userId, date, amount, reason },
  actor,
) {
  // As in `originatePtoAward`: one live candidate per date (`D-21`), so an
  // existing one is answered rather than collided with at the index.
  const existing = await getCtoApplicationForDate(userId, date);
  if (existing) {
    throw new ValidationError(
      `A ${existing.status.toLowerCase()} CTO application already exists for ${date}. Decide that one rather than applying a second.`,
    );
  }

  const created = await upsertCtoCandidate(
    userId,
    date,
    {
      action: 'CREATE',
      patch: { status: 'PENDING', rule: MANUAL_GRANT, amount },
    },
    actor,
  );

  return approveCtoApplication(
    String(created._id),
    { amount, reason, override: true },
    created.version,
    actor,
  );
}

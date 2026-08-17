import {
  APPROVAL_STATUS,
  LEDGER_ENTRY_TYPE,
  REDUCTION_CHANGE,
} from '../constants/index.js';
import {
  getApprovalById,
  getUserById,
  listLedgerEntriesForSource,
  listTenures,
  listUserDatedRecords,
  raiseReductionApproval,
  reverseLedgerEntries,
  setReductionRecordsDeleted,
  updateApprovalStatus,
  ValidationError,
} from '../database.js';
import { recordsOutsidePeriod } from '../utils/employment.js';

/**
 * `FR-2.11`, and `ARCHITECTURE.md` §19.5's worked example.
 *
 * **What does not wait for this.** The user's soft delete and their loss of
 * access take effect immediately — they are already done by the time anything
 * here runs. What waits is only the fate of the records left stranded outside
 * the reduced employment period.
 *
 * **What never happens to a ledger entry.** It is not edited and not deleted
 * (`NFR-9`). Approval posts a reversing entry; a later restore reverses the
 * reversal, and the balance returns exactly rather than approximately.
 */

/** Human wording for the queue, so `IT` knows which thing to correct. */
const CHANGE_DESCRIPTIONS = Object.freeze({
  [REDUCTION_CHANGE.USER_SOFT_DELETED]:
    'The user was soft deleted, which closed their open tenure at their date of leaving.',
  [REDUCTION_CHANGE.TENURE_SOFT_DELETED]:
    'A tenure was soft deleted, removing the dates it covered from the employment period.',
  [REDUCTION_CHANGE.DATE_OF_LEAVING_MOVED]:
    'The date of leaving moved earlier, shortening the employment period.',
});

/**
 * Runs after any change that may reduce a period. Returns the approval it
 * raised, or `null` where nothing was stranded and the change simply stands.
 *
 * A widening needs no approval and reaches this with an empty stranded set,
 * which is why the same call is safe on every tenure change.
 */
export async function checkReduction(userId, change, actor) {
  const [user, tenures, records] = await Promise.all([
    getUserById(userId),
    listTenures(userId),
    listUserDatedRecords(userId),
  ]);
  if (!user) return null;

  const stranded = recordsOutsidePeriod(tenures, records);
  if (stranded.length === 0) return null;

  return raiseReductionApproval(
    {
      userId,
      userName: user.fullName,
      change: {
        kind: change.kind,
        description:
          change.description ?? CHANGE_DESCRIPTIONS[change.kind] ?? null,
      },
      records: stranded,
    },
    actor,
  );
}

/** Every ledger entry the stranded records caused, in one list. */
async function entriesBehind(records) {
  const found = [];
  for (const record of records) {
    found.push(
      ...(await listLedgerEntriesForSource(record.sourceType, record._id)),
    );
  }
  return found;
}

function assertPending(approval) {
  if (approval.status !== APPROVAL_STATUS.PENDING) {
    throw new ValidationError(
      `This reduction is already ${approval.status.toLowerCase()} and cannot be decided again.`,
    );
  }
}

/**
 * §19.5 steps 4 and 5. The records get `deletedAt` and leave every total; each
 * entry they caused is reversed, not edited; the balance replays higher.
 */
export async function approveReduction(id, reason, version, actor) {
  const before = await getApprovalById(id);
  if (!before) return null;
  assertPending(before);

  const after = await updateApprovalStatus(
    id,
    {
      status: APPROVAL_STATUS.APPROVED,
      decidedAt: new Date(),
      reason,
      action: 'EMPLOYMENT_REDUCTION_APPROVED',
    },
    version,
    actor,
  );
  if (!after) return null;

  await setReductionRecordsDeleted(before.records, true, actor);

  const entries = await entriesBehind(before.records);
  // A reversal already posted by an earlier approve/restore cycle must not be
  // reversed again — that would re-apply the very deduction this is cancelling.
  const live = entries.filter(
    (entry) => entry.entryType !== LEDGER_ENTRY_TYPE.REVERSAL,
  );
  const alreadyReversed = new Set(
    entries
      .filter((entry) => entry.entryType === LEDGER_ENTRY_TYPE.REVERSAL)
      .map((entry) => String(entry.reversalOf)),
  );

  await reverseLedgerEntries(
    live.filter((entry) => !alreadyReversed.has(String(entry._id))),
    { actor, reason },
  );

  return after;
}

/** Nothing moves. `IT` corrects a wrong date or restores a tenure and resubmits. */
export async function rejectReduction(id, reason, version, actor) {
  const before = await getApprovalById(id);
  if (!before) return null;
  assertPending(before);

  return updateApprovalStatus(
    id,
    {
      status: APPROVAL_STATUS.DECLINED,
      decidedAt: new Date(),
      reason,
      action: 'EMPLOYMENT_REDUCTION_REJECTED',
    },
    version,
    actor,
  );
}

/**
 * §19.5 step 6. `OFFICE_ADMIN` may restore at any time afterwards, which also
 * reverses the reversing entries — so the balance returns to exactly what it
 * was, computed from a ledger where nothing was ever destroyed.
 */
export async function restoreReduction(id, reason, version, actor) {
  const before = await getApprovalById(id);
  if (!before) return null;

  if (before.status !== APPROVAL_STATUS.APPROVED) {
    throw new ValidationError(
      'Only an approved reduction has anything to restore — nothing was soft deleted.',
    );
  }

  const after = await updateApprovalStatus(
    id,
    {
      restoredAt: new Date(),
      restoredBy: actor.userId,
      reason,
      action: 'EMPLOYMENT_REDUCTION_RESTORED',
    },
    version,
    actor,
  );
  if (!after) return null;

  await setReductionRecordsDeleted(before.records, false, actor);

  const entries = await entriesBehind(before.records);
  const reversals = entries.filter(
    (entry) => entry.entryType === LEDGER_ENTRY_TYPE.REVERSAL,
  );

  // Anything already cancelled by something else, whatever its type: an entry
  // is "already reversed" when some other entry points at it.
  const cancelled = new Set(
    entries
      .filter((entry) => entry.reversalOf)
      .map((entry) => String(entry.reversalOf)),
  );

  // Reverse the reversals — never delete them (FR-6.8). Only the ones not yet
  // themselves reversed, so a second restore is a no-op rather than a swing.
  await reverseLedgerEntries(
    reversals.filter((entry) => !cancelled.has(String(entry._id))),
    { actor, reason },
  );

  return after;
}

import { addDays, format, parseISO } from 'date-fns';
import { LEDGER_ENTRY_TYPE, MANUAL_GRANT } from '../constants/index.js';
import {
  getPtoAwardById,
  getPtoAwardForDate,
  getTeamPolicy,
  getUserById,
  listApprovedPtoAwardsPastExpiry,
  listLedgerEntriesForSource,
  markPtoAwardApproved,
  markPtoAwardDeclined,
  overridePtoAwardExpiry,
  postLedgerEntries,
  reverseLedgerEntries,
  upsertPtoCandidate,
  ValidationError,
} from '../database.js';

/**
 * §21, `D-25`. `PTO` is a pseudo leave type, company-wide rather than a
 * `teamPolicy.leaveTypes` entry — the same shape `D-13` already gave `WFH`.
 */
export const PTO_LEAVE_TYPE = 'PTO';

const DEFAULT_VALIDITY_DAYS = 30;

async function validityDaysFor(userId) {
  const user = await getUserById(userId);
  if (!user?.teamId) return DEFAULT_VALIDITY_DAYS;
  const policy = await getTeamPolicy(user.teamId);
  return policy?.ptoValidityDays ?? DEFAULT_VALIDITY_DAYS;
}

/**
 * P-01, `FR-7.1`, `FR-7.2`. Unconstrained: the ladder decided what was
 * proposed, never what may be approved — `amount` may differ from
 * `proposedAmount`, including to a figure no ladder row produces.
 *
 * `FR-7.3`'s second sentence: approving after the natural 30-day expiry has
 * already passed extends `expiresAt` to 30 days from TODAY rather than
 * letting the award expire before anyone ever saw it, and marks the
 * extension so `S-15` can show it.
 */
export async function approvePtoAward(id, { amount, reason }, version, actor) {
  const before = await getPtoAwardById(id);
  if (!before) return null;

  if (before.status !== 'PENDING') {
    throw new ValidationError(
      `This award is already ${before.status.toLowerCase()} and cannot be approved again.`,
    );
  }

  // `D-22`: a withdrawal leaves the record PENDING so a later recalculation can
  // revive it, which makes the status test above insufficient on its own. The
  // day no longer earns anything, so approving it would post an award for work
  // the engine can no longer see. FR-7.7's manual grant is the way through.
  if (before.withdrawn) {
    throw new ValidationError(
      'This day no longer qualifies for PTO, so the suggestion was withdrawn. Grant it manually if it is still owed.',
    );
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const validityDays = await validityDaysFor(before.userId);
  const naturalExpiry = format(
    addDays(parseISO(before.date), validityDays),
    'yyyy-MM-dd',
  );
  const pastDue = naturalExpiry < today;
  const expiresAt = pastDue
    ? format(addDays(parseISO(today), validityDays), 'yyyy-MM-dd')
    : naturalExpiry;

  const after = await markPtoAwardApproved(
    id,
    {
      status: 'APPROVED',
      approvedAmount: amount,
      expiresAt,
      expiryExtended: pastDue,
      reason,
    },
    version,
    actor,
  );
  if (!after) return null;

  await postLedgerEntries(
    [
      {
        entryType: LEDGER_ENTRY_TYPE.PTO_AWARD,
        leaveType: PTO_LEAVE_TYPE,
        amount,
        rule: after.rule,
      },
    ],
    {
      sourceType: 'ptoAward',
      sourceId: id,
      sourceVersion: after.version,
      userId: after.userId,
      date: after.date,
      actor,
      reason,
    },
  );

  return after;
}

/** P-03, `FR-7.8`. Posts nothing; the snapshot is what `D-22` compares a re-proposal against. */
export async function declinePtoAward(id, reason, version, actor) {
  const before = await getPtoAwardById(id);
  if (!before) return null;

  if (before.status !== 'PENDING') {
    throw new ValidationError(
      `This award is already ${before.status.toLowerCase()} and cannot be declined.`,
    );
  }

  return markPtoAwardDeclined(
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
 * P-04, `FR-7.7`. For a user and date the engine raised no suggestion for —
 * creates and approves in one action, identified in the ledger as a manual
 * grant.
 */
export async function originatePtoAward(
  { userId, date, amount, reason },
  actor,
) {
  // FR-7.7 is explicitly "for a user and date the engine raised no suggestion
  // for". Only one live candidate exists per date (`D-21`), so without this
  // the insert collides at the unique index and a routine mistake surfaces as
  // a driver error rather than an answer S-15 can show.
  const existing = await getPtoAwardForDate(userId, date);
  if (existing) {
    throw new ValidationError(
      `A ${existing.status.toLowerCase()} PTO award already exists for ${date}. Decide that one rather than granting a second.`,
    );
  }

  const created = await upsertPtoCandidate(
    userId,
    date,
    {
      action: 'CREATE',
      patch: { status: 'PENDING', rule: MANUAL_GRANT, amount },
    },
    actor,
  );

  return approvePtoAward(
    String(created._id),
    { amount, reason },
    created.version,
    actor,
  );
}

/**
 * `D-24`. No cron exists in this app, so an award's expiry posts the first
 * time anything looks at a date past it — the same shape `ensureEntitlementCredited`
 * (`D-12`) already established. Relies entirely on the ledger's `effectKey`
 * index for idempotency, exactly as that guard does; no bookkeeping flag of
 * its own.
 */
export async function ensurePtoExpiryPosted(userId, actor) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const due = await listApprovedPtoAwardsPastExpiry(userId, today);

  for (const award of due) {
    await postLedgerEntries(
      [
        {
          entryType: LEDGER_ENTRY_TYPE.PTO_EXPIRY,
          leaveType: PTO_LEAVE_TYPE,
          amount: -award.approvedAmount,
          rule: 'FR-7.3',
        },
      ],
      {
        sourceType: 'ptoAward',
        sourceId: String(award._id),
        sourceVersion: award.version,
        userId,
        date: award.expiresAt,
        actor,
        reason: 'PTO expired unused',
      },
    );
  }
}

/**
 * P-27, `FR-7.3`, `FR-6.10`. If the award already expired (a `PTO_EXPIRY`
 * entry exists), that entry is REVERSED first — an entry is never edited
 * (`FR-6.8`) — before the new date takes over. The guard reposts expiry
 * later only if the new date has also passed by then.
 */
export async function overridePtoExpiry(
  id,
  { expiresAt, reason },
  version,
  actor,
) {
  const before = await getPtoAwardById(id);
  if (!before) return null;

  const existing = await listLedgerEntriesForSource('ptoAward', id);
  const postedExpiry = existing.filter(
    (entry) => entry.entryType === LEDGER_ENTRY_TYPE.PTO_EXPIRY,
  );

  if (postedExpiry.length > 0) {
    await reverseLedgerEntries(postedExpiry, { actor, reason });
  }

  return overridePtoAwardExpiry(
    id,
    { expiresAt, expiryExtended: true, reason },
    version,
    actor,
  );
}

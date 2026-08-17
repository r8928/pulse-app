/**
 * D-22 (design record, 2026-08-17). What a recalculation may do to an
 * existing PTO or CTO candidate, given what the day now implies. Shared by
 * both — `ptoAwards` and `ctoApplications` carry the same lifecycle.
 *
 * `FR-7.8`: "A declined candidate shall not be re-proposed for the same day
 * unless that day's attendance data changes." A decline is tied to the
 * SPECIFIC proposal it declined — stored as `declinedSnapshot` — not to the
 * day as a blank slate forever. `PENDING` belongs to nobody's decision yet,
 * so it is corrected freely; `APPROVED` is the decision now (`I-6`) and
 * `recalculateDays` must never touch it, whatever the day recomputes to.
 *
 * Pure: takes the freshly computed proposal and the stored record, returns
 * what to do. The caller performs the write.
 *
 * @param {{
 *   desired: { rule: string, amount: number } | null,
 *   existing: object | null,
 * }} input
 * @returns {{ action: 'CREATE', patch: object }
 *         | { action: 'UPDATE', patch: object }
 *         | { action: 'NONE' }}
 */
export function reconcileCandidate({ desired, existing }) {
  if (!existing) {
    return desired
      ? { action: 'CREATE', patch: { status: 'PENDING', ...desired } }
      : { action: 'NONE' };
  }

  if (existing.status === 'APPROVED') {
    // I-6: the ledger entries this already posted are the decision now.
    return { action: 'NONE' };
  }

  if (existing.status === 'PENDING') {
    if (!desired) {
      // Never deleted — withdrawn stays visible, matching how a day record
      // itself is never deleted just because a punch moved (I-1's ethos).
      return { action: 'UPDATE', patch: { withdrawn: true } };
    }

    const unchanged =
      existing.rule === desired.rule && existing.amount === desired.amount;

    return unchanged
      ? { action: 'NONE' }
      : { action: 'UPDATE', patch: { status: 'PENDING', ...desired } };
  }

  // status === 'DECLINED'
  const matchesWhatWasDeclined =
    desired &&
    existing.declinedSnapshot?.rule === desired.rule &&
    existing.declinedSnapshot?.amount === desired.amount;

  if (!desired || matchesWhatWasDeclined) {
    return { action: 'NONE' };
  }

  // The day changed since the decline: propose fresh, leaving the declined
  // record exactly as it is (FR-7.8: "remaining visible in the day's
  // history").
  return { action: 'CREATE', patch: { status: 'PENDING', ...desired } };
}

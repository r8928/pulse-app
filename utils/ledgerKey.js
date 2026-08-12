/**
 * The identity of a ledger movement, used by a unique index to make
 * recalculation safely re-runnable (NFR-15, invariant I-9).
 *
 * Two entries share an identity when they are *the same effect recomputed*.
 * The index then refuses the second insert.
 *
 * This is **defence in depth, not the primary mechanism** — the reconciliation
 * step in `recalculateDays` is what normally prevents a double post, and if it
 * is written correctly this index never fires. It earns its place because the
 * failure it guards against is silent balance corruption, and FR-6.8 forbids
 * cleaning that up: a ledger entry can only ever be reversed, never deleted,
 * so duplicates would remain visible on S-14 permanently.
 *
 * **The source version is part of the identity, and that is the whole trick.**
 * Without it, a legitimate correction — a fixed punch moving a day's deduction
 * from 0.25 to 0.5 — would produce the same key as the entry it replaces and
 * be refused, breaking correct behaviour rather than protecting it. With it, a
 * re-run of an unchanged day reuses the version and is refused, while a real
 * change bumps the source's version and is allowed. It stays correct even when
 * a value returns to an earlier amount, because versions only increase.
 *
 * This carries one requirement on the caller: `recalculateDays` must not bump
 * a record's version when nothing about it changed. That is correct behaviour
 * anyway — a spurious bump also causes a stale-write 409 for anyone else
 * holding the record.
 *
 * The amount is deliberately NOT part of the identity. Two entries differing
 * only in amount at the same source version are the same effect computed
 * twice, which is exactly what must not post twice.
 *
 * Nothing here mutates an existing entry, so the ledger stays strictly
 * append-only (FR-6.8, DC-3).
 */

/** Absent leave type, for PTO movements. Its own value, never an empty string. */
const NO_LEAVE_TYPE = '~none';

/**
 * Leave types are per-team configuration and therefore arbitrary strings. An
 * unescaped join would let a type containing the separator forge another
 * entry's key.
 */
const encode = (value) => encodeURIComponent(String(value));

export function ledgerEffectKey({
  sourceType,
  sourceId,
  sourceVersion,
  entryType,
  leaveType,
}) {
  // DC-6: no fallback hides a gap. Defaulting a missing version would silently
  // disable the protection this function exists to provide.
  if (sourceVersion === undefined || sourceVersion === null) {
    throw new Error('ledgerEffectKey requires a sourceVersion.');
  }
  if (!sourceId) {
    throw new Error('ledgerEffectKey requires a sourceId.');
  }
  if (!sourceType) {
    throw new Error('ledgerEffectKey requires a sourceType.');
  }
  if (!entryType) {
    throw new Error('ledgerEffectKey requires an entryType.');
  }

  return [
    encode(sourceType),
    encode(sourceId),
    `v${encode(sourceVersion)}`,
    encode(entryType),
    leaveType === null || leaveType === undefined
      ? NO_LEAVE_TYPE
      : encode(leaveType),
  ].join(':');
}

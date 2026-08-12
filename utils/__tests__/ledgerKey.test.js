import { describe, expect, it } from 'vitest';
import { LEDGER_ENTRY_TYPE } from '../../constants/index.js';
import { ledgerEffectKey } from '../ledgerKey.js';

/**
 * NFR-15 and invariant I-9: a recalculation must be safely re-runnable without
 * double-posting a ledger entry.
 *
 * This builds the identity a unique index enforces. It is defence in depth —
 * the reconciliation step in recalculateDays is the primary mechanism — but
 * the failure it guards against is silent balance corruption that FR-6.8
 * forbids cleaning up, since a ledger entry can only ever be reversed.
 *
 * The source version is part of the identity on purpose. Without it, a
 * legitimate change — a corrected punch moving a deduction from 0.25 to 0.5 —
 * would produce the same key as the entry it replaces and be refused by the
 * index, breaking correct behaviour rather than protecting it.
 */

const base = {
  sourceType: 'dayRecord',
  sourceId: '507f1f77bcf86cd799439011',
  sourceVersion: 3,
  entryType: LEDGER_ENTRY_TYPE.AUTOMATIC_DEDUCTION,
  leaveType: 'Casual',
};

describe('ledgerEffectKey', () => {
  it('is deterministic, so the same recalculation yields the same identity', () => {
    expect(ledgerEffectKey(base)).toBe(ledgerEffectKey({ ...base }));
  });

  it('changes when the source version changes, so a real correction can post', () => {
    expect(ledgerEffectKey({ ...base, sourceVersion: 4 })).not.toBe(
      ledgerEffectKey(base),
    );
  });

  it('does not change when only the amount changes, since amount is not identity', () => {
    // Two entries differing only in amount, at the same source version, are the
    // same effect recomputed — exactly what must not post twice.
    expect(ledgerEffectKey({ ...base, amount: -0.5 })).toBe(
      ledgerEffectKey({ ...base, amount: -0.25 }),
    );
  });

  it('separates entry types, so a deduction and a credit on one day coexist', () => {
    expect(
      ledgerEffectKey({ ...base, entryType: LEDGER_ENTRY_TYPE.CTO_APPLIED }),
    ).not.toBe(ledgerEffectKey(base));
  });

  it('separates leave types, so Annual and Casual movements coexist', () => {
    expect(ledgerEffectKey({ ...base, leaveType: 'Annual' })).not.toBe(
      ledgerEffectKey(base),
    );
  });

  it('separates sources, so two users on one date do not collide', () => {
    expect(
      ledgerEffectKey({ ...base, sourceId: '507f1f77bcf86cd799439012' }),
    ).not.toBe(ledgerEffectKey(base));
  });

  it('represents an absent leave type distinctly, for PTO entries', () => {
    // PTO movements carry no leave type. That must be its own value, not an
    // empty string a configured leave type could ever equal.
    const pto = ledgerEffectKey({
      ...base,
      entryType: LEDGER_ENTRY_TYPE.PTO_AWARD,
      leaveType: null,
    });
    const empty = ledgerEffectKey({
      ...base,
      entryType: LEDGER_ENTRY_TYPE.PTO_AWARD,
      leaveType: '',
    });

    expect(pto).not.toBe(empty);
  });

  it('does not let a leave type containing the separator forge another key', () => {
    // Leave types are per-team configuration and therefore arbitrary strings.
    // An unescaped join would let "Casual:x" collide with a different entry.
    const a = ledgerEffectKey({ ...base, leaveType: 'Casual:Special' });
    const b = ledgerEffectKey({ ...base, leaveType: 'Casual' });

    expect(a).not.toBe(b);
    expect(a.split(':')).toHaveLength(b.split(':').length);
  });

  it('rejects a missing source version rather than silently keying without it', () => {
    // Defaulting to 0 would silently disable the protection this exists to
    // provide (DC-6: no fallback hides a gap).
    expect(() =>
      ledgerEffectKey({ ...base, sourceVersion: undefined }),
    ).toThrow(/sourceVersion/);
  });

  it('rejects a missing source id', () => {
    expect(() => ledgerEffectKey({ ...base, sourceId: null })).toThrow(
      /sourceId/,
    );
  });
});

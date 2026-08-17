import { describe, expect, it } from 'vitest';
import { reconcileCandidate } from '../candidates.js';

/**
 * D-22 (design record). A decline is tied to the specific proposal it
 * declined, not to the day as a blank slate forever. A pending candidate
 * belongs to nobody's decision yet, so recalculation may still correct it.
 * An approved one is the decision now (I-6).
 */

const pending = (rule, amount) => ({
  status: 'PENDING',
  rule,
  amount,
});

const approved = (rule, amount) => ({
  status: 'APPROVED',
  rule,
  approvedAmount: amount,
});

const declined = (rule, amount) => ({
  status: 'DECLINED',
  declinedSnapshot: { rule, amount },
});

describe('reconcileCandidate', () => {
  it('creates one where none existed and the day now qualifies', () => {
    expect(
      reconcileCandidate({
        desired: { rule: 'BR-19', amount: 1 },
        existing: null,
      }),
    ).toEqual({
      action: 'CREATE',
      patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
    });
  });

  it('does nothing where none existed and the day still does not qualify', () => {
    expect(reconcileCandidate({ desired: null, existing: null })).toEqual({
      action: 'NONE',
    });
  });

  it('updates a pending candidate when the day now implies a different rule', () => {
    expect(
      reconcileCandidate({
        desired: { rule: 'BR-19', amount: 1 },
        existing: pending('BR-18', 0.5),
      }),
    ).toEqual({
      action: 'UPDATE',
      patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
    });
  });

  it('does nothing when a pending candidate already matches exactly (I-9)', () => {
    expect(
      reconcileCandidate({
        desired: { rule: 'BR-19', amount: 1 },
        existing: pending('BR-19', 1),
      }),
    ).toEqual({ action: 'NONE' });
  });

  it('withdraws a pending candidate the day no longer implies, never deletes it', () => {
    expect(
      reconcileCandidate({ desired: null, existing: pending('BR-18', 0.5) }),
    ).toEqual({ action: 'UPDATE', patch: { withdrawn: true } });
  });

  it('never touches an approved candidate, whatever the day now implies (I-6)', () => {
    expect(
      reconcileCandidate({
        desired: { rule: 'BR-20', amount: 2 },
        existing: approved('BR-18', 0.5),
      }),
    ).toEqual({ action: 'NONE' });

    expect(
      reconcileCandidate({ desired: null, existing: approved('BR-18', 0.5) }),
    ).toEqual({ action: 'NONE' });
  });

  it('does not re-propose a declined candidate for the same unchanged day (FR-7.8)', () => {
    expect(
      reconcileCandidate({
        desired: { rule: 'BR-18', amount: 0.5 },
        existing: declined('BR-18', 0.5),
      }),
    ).toEqual({ action: 'NONE' });
  });

  it('does nothing further when a declined day no longer qualifies at all', () => {
    expect(
      reconcileCandidate({ desired: null, existing: declined('BR-18', 0.5) }),
    ).toEqual({ action: 'NONE' });
  });

  it('creates a fresh candidate when the day changed since the decline, leaving it in place', () => {
    const result = reconcileCandidate({
      desired: { rule: 'BR-19', amount: 1 },
      existing: declined('BR-18', 0.5),
    });

    expect(result).toEqual({
      action: 'CREATE',
      patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
    });
    // The old declined record is not part of the patch at all — it is
    // addressed by its own id and stays exactly as it was.
  });
});

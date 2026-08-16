import { describe, expect, it } from 'vitest';
import {
  desiredEntriesForDay,
  reconcileLedger,
  WFH_LEAVE_TYPE,
} from '../ledger.js';

const policy = { automaticDeductionLeaveType: 'Casual' };

const day = (computed, override = null) => ({
  computed: {
    dayStatus: 'WFO',
    workedMinutes: 0,
    lateMinutes: 0,
    deduction: 0,
    deductionRule: null,
    ...computed,
  },
  override,
});

describe('desiredEntriesForDay', () => {
  it("implies an AUTOMATIC_DEDUCTION against the team's configured type (FR-6.3)", () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({
        deduction: 0.25,
        deductionRule: 'BR-9:profileB:band1',
      }),
      policy,
      leaveRecord: null,
    });

    expect(entries).toEqual([
      {
        entryType: 'AUTOMATIC_DEDUCTION',
        leaveType: 'Casual',
        amount: -0.25,
        rule: 'BR-9:profileB:band1',
      },
    ]);
  });

  it('implies nothing at all for a clean day', () => {
    expect(
      desiredEntriesForDay({ dayRecord: day({}), policy, leaveRecord: null }),
    ).toEqual([]);
  });

  it('honours a waiver override, implying no deduction (P-25, BR-8)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day(
        { deduction: 0.25, deductionRule: 'BR-9:profileB:band1' },
        { deduction: 0 },
      ),
      policy,
      leaveRecord: null,
    });

    expect(entries).toEqual([]);
  });

  it('implies a LEAVE_AVAILED of the type on the leave record (BR-11)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'LEAVE' }),
      policy,
      leaveRecord: { leaveType: 'Sick', amount: 1 },
    });

    expect(entries).toEqual([
      {
        entryType: 'LEAVE_AVAILED',
        leaveType: 'Sick',
        amount: -1,
        rule: 'BR-11',
      },
    ]);
  });

  it('posts a half-day LEAVE_AVAILED alongside the deduction the worked half earned (D-11)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({
        dayStatus: 'LEAVE',
        deduction: 0.25,
        deductionRule: 'BR-9:profileB:band1',
      }),
      policy,
      leaveRecord: {
        leaveType: 'Casual',
        amount: 0.5,
        halfDayPeriod: 'AFTERNOON',
      },
    });

    expect(entries).toContainEqual({
      entryType: 'LEAVE_AVAILED',
      leaveType: 'Casual',
      amount: -0.5,
      rule: 'BR-11',
    });
    expect(entries).toContainEqual({
      entryType: 'AUTOMATIC_DEDUCTION',
      leaveType: 'Casual',
      amount: -0.25,
      rule: 'BR-9:profileB:band1',
    });
  });

  it('debits the WFH count on a work-from-home day (D-13, BR-16)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'WFH' }),
      policy,
      leaveRecord: null,
    });

    expect(entries).toEqual([
      {
        entryType: 'WFH_USED',
        leaveType: WFH_LEAVE_TYPE,
        amount: -1,
        rule: 'BR-16',
      },
    ]);
  });

  it('reads the effective status, so an override to WFH debits WFH (FR-6.11)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'WFO' }, { dayStatus: 'WFH' }),
      policy,
      leaveRecord: null,
    });

    expect(entries.map((entry) => entry.entryType)).toEqual(['WFH_USED']);
  });

  it('implies no LEAVE_AVAILED when the status is LEAVE but no leave record backs it', () => {
    // A status override to LEAVE with no record is a state P-23 must not
    // produce (D-9, D-16). Implying an untyped debit would guess the type,
    // which DC-6 forbids.
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'LEAVE' }),
      policy,
      leaveRecord: null,
    });

    expect(entries).toEqual([]);
  });
});

const existingEntry = (entryType, leaveType, amount, extra = {}) => ({
  _id: `${entryType}-${leaveType}-${amount}`,
  entryType,
  leaveType,
  amount,
  ...extra,
});

describe('reconcileLedger', () => {
  it('posts an entry the day now implies and nothing else', () => {
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        {
          entryType: 'AUTOMATIC_DEDUCTION',
          leaveType: 'Casual',
          amount: -0.25,
          rule: 'r',
        },
      ],
      existing: [],
    });

    expect(toPost).toHaveLength(1);
    expect(toReverse).toEqual([]);
  });

  it('does nothing at all on a re-run with the same conclusion (I-9)', () => {
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        {
          entryType: 'AUTOMATIC_DEDUCTION',
          leaveType: 'Casual',
          amount: -0.25,
          rule: 'r',
        },
      ],
      existing: [existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25)],
    });

    expect(toPost).toEqual([]);
    expect(toReverse).toEqual([]);
  });

  it('reverses an entry the day no longer implies, never deletes it (I-1, FR-6.8)', () => {
    const stale = existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25);
    const { toPost, toReverse } = reconcileLedger({
      desired: [],
      existing: [stale],
    });

    expect(toPost).toEqual([]);
    expect(toReverse).toEqual([stale]);
  });

  it('reverses and re-posts when the amount changed', () => {
    const old = existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25);
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        {
          entryType: 'AUTOMATIC_DEDUCTION',
          leaveType: 'Casual',
          amount: -0.5,
          rule: 'r',
        },
      ],
      existing: [old],
    });

    expect(toReverse).toEqual([old]);
    expect(toPost).toHaveLength(1);
    expect(toPost[0].amount).toBe(-0.5);
  });

  it('treats a different leave type as a different effect', () => {
    const sick = existingEntry('LEAVE_AVAILED', 'Sick', -1);
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        {
          entryType: 'LEAVE_AVAILED',
          leaveType: 'Casual',
          amount: -1,
          rule: 'BR-11',
        },
      ],
      existing: [sick],
    });

    expect(toReverse).toEqual([sick]);
    expect(toPost[0].leaveType).toBe('Casual');
  });

  it('ignores entries already reversed, and the reversals themselves', () => {
    const original = existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25, {
      _id: 'original',
    });
    const reversal = existingEntry('REVERSAL', 'Casual', 0.25, {
      _id: 'reversal',
      reversalOf: 'original',
    });

    const { toPost, toReverse } = reconcileLedger({
      desired: [
        {
          entryType: 'AUTOMATIC_DEDUCTION',
          leaveType: 'Casual',
          amount: -0.25,
          rule: 'r',
        },
      ],
      existing: [original, reversal],
    });

    // The original is cancelled, so the day's implication is unmet and posts
    // afresh; nothing is reversed a second time.
    expect(toReverse).toEqual([]);
    expect(toPost).toHaveLength(1);
  });
});

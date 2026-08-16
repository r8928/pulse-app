import { describe, expect, it } from 'vitest';
import {
  flagDuplicates,
  impossibleDurationExceptions,
  pairPunches,
  workedMinutes,
} from '../duration.js';

const punch = (id, type, at) => ({ _id: id, type, at: new Date(at) });

describe('flagDuplicates', () => {
  it('flags a second check-in inside the window as a duplicate of the first', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:05:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set(['b']));
  });

  it('does not flag punches outside the window', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:15:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set());
  });

  it('does not compare punches of different types', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_OUT', '2026-08-12T09:02:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set());
  });

  it('flags every close punch of a run against the first, not a rolling chain', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:05:00Z'),
      punch('c', 'CHECK_IN', '2026-08-12T09:10:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set(['b', 'c']));
  });

  it('is insensitive to input order', () => {
    const punches = [
      punch('b', 'CHECK_IN', '2026-08-12T09:05:00Z'),
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set(['b']));
  });

  it('treats a zero-minute window as flagging only exact-instant repeats', () => {
    const sameInstant = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00.000Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:00:00.000Z'),
    ];
    expect(flagDuplicates(sameInstant, 0)).toEqual(new Set(['b']));

    const oneSecondApart = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00.000Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:00:01.000Z'),
    ];
    expect(flagDuplicates(oneSecondApart, 0)).toEqual(new Set());
  });

  it('returns an empty set for no punches', () => {
    expect(flagDuplicates([], 10)).toEqual(new Set());
  });
});

const live = (id, type, at) => ({
  _id: id,
  type,
  at: new Date(at),
  deletedAt: null,
  isDuplicate: false,
});

describe('pairPunches', () => {
  it('pairs the two-pair worked example exactly (ARCHITECTURE 14.3)', () => {
    const punches = [
      live('1', 'CHECK_IN', '2026-08-12T09:02:00Z'),
      live('2', 'CHECK_OUT', '2026-08-12T13:00:00Z'),
      live('3', 'CHECK_IN', '2026-08-12T13:45:00Z'),
      live('4', 'CHECK_OUT', '2026-08-12T18:04:00Z'),
    ];
    const { pairs, exceptions } = pairPunches(punches);
    expect(pairs).toHaveLength(2);
    expect(exceptions).toEqual([]);
    expect(workedMinutes(pairs)).toBe(497);
  });

  it('flags a lone check-in as MISSING_CHECK_OUT and pairs nothing', () => {
    const { pairs, exceptions } = pairPunches([
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
    ]);
    expect(pairs).toEqual([]);
    expect(exceptions).toEqual(['MISSING_CHECK_OUT']);
  });

  it('flags a lone check-out as MISSING_CHECK_IN', () => {
    const { exceptions } = pairPunches([
      live('1', 'CHECK_OUT', '2026-08-12T09:00:00Z'),
    ]);
    expect(exceptions).toEqual(['MISSING_CHECK_IN']);
  });

  it('flags an unclosed check-in when a second one follows', () => {
    const punches = [
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      live('2', 'CHECK_IN', '2026-08-12T09:10:00Z'),
      live('3', 'CHECK_OUT', '2026-08-12T17:00:00Z'),
    ];
    const { pairs, exceptions } = pairPunches(punches);
    expect(exceptions).toEqual(['MISSING_CHECK_OUT']);
    expect(pairs).toEqual([[punches[1], punches[2]]]);
  });

  it('excludes soft-deleted and duplicate-flagged punches from pairing', () => {
    const punches = [
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      { ...live('2', 'CHECK_IN', '2026-08-12T09:05:00Z'), isDuplicate: true },
      {
        ...live('3', 'CHECK_OUT', '2026-08-12T17:00:00Z'),
        deletedAt: new Date(),
      },
      live('4', 'CHECK_OUT', '2026-08-12T17:05:00Z'),
    ];
    const { pairs, exceptions, livePunches } = pairPunches(punches);
    expect(livePunches.map((p) => p._id)).toEqual(['1', '4']);
    expect(pairs).toHaveLength(1);
    expect(exceptions).toEqual([]);
  });

  it('sorts out-of-order input before pairing', () => {
    const punches = [
      live('2', 'CHECK_OUT', '2026-08-12T17:00:00Z'),
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
    ];
    const { pairs } = pairPunches(punches);
    expect(pairs[0][0]._id).toBe('1');
    expect(pairs[0][1]._id).toBe('2');
  });
});

describe('impossibleDurationExceptions', () => {
  it('flags a pair totalling more than 24 hours', () => {
    const pairs = [
      [
        { at: new Date('2026-08-12T00:00:00Z') },
        { at: new Date('2026-08-13T01:00:00Z') },
      ],
    ];
    expect(impossibleDurationExceptions(pairs)).toEqual([
      'IMPOSSIBLE_DURATION',
    ]);
  });

  it('flags a check-out earlier than its check-in, and workedMinutes does not go negative', () => {
    const pairs = [
      [
        { at: new Date('2026-08-12T09:00:00Z') },
        { at: new Date('2026-08-12T08:00:00Z') },
      ],
    ];
    expect(impossibleDurationExceptions(pairs)).toEqual([
      'IMPOSSIBLE_DURATION',
    ]);
    expect(workedMinutes(pairs)).toBe(0);
  });

  it('flags nothing for an ordinary pair', () => {
    const pairs = [
      [
        { at: new Date('2026-08-12T09:00:00Z') },
        { at: new Date('2026-08-12T17:00:00Z') },
      ],
    ];
    expect(impossibleDurationExceptions(pairs)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  listLedgerEntriesForUser,
  postLedgerEntries,
  replayBalance,
  reverseLedgerEntries,
  summariseBalances,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * ARCHITECTURE §19.2 and I-2. A balance is NEVER stored: it is replayed by
 * summing entries. Every entry is already signed, which is why BR-14's two
 * formulas — leave and PTO — are one implementation and not two.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const post = (entries, overrides = {}) =>
  postLedgerEntries(entries, {
    sourceType: 'dayRecord',
    sourceId: '64b7f9c2f1a2b3c4d5e6f7a8',
    sourceVersion: 1,
    userId: 'u1',
    date: '2026-08-12',
    actor,
    ...overrides,
  });

const credit = (leaveType, amount) => ({
  entryType: 'ENTITLEMENT_CREDIT',
  leaveType,
  amount,
  rule: 'BR-12',
});

const availed = (leaveType, amount) => ({
  entryType: 'LEAVE_AVAILED',
  leaveType,
  amount,
  rule: 'BR-11',
});

describe('replayBalance', () => {
  useTestDatabase();

  it('replays an empty ledger as zero rather than as nothing', async () => {
    expect(await replayBalance('nobody', 'Casual', '2026-12-31')).toBe(0);
  });

  it('sums a credit against a debit', async () => {
    await post([credit('Casual', 10)]);
    await post([availed('Casual', -1)], { sourceVersion: 2 });

    expect(await replayBalance('u1', 'Casual', '2026-12-31')).toBe(9);
  });

  it('excludes an entry dated after the date asked about', async () => {
    await post([credit('Casual', 10)], { date: '2026-01-01' });
    await post([availed('Casual', -1)], {
      date: '2026-09-01',
      sourceVersion: 2,
    });

    expect(await replayBalance('u1', 'Casual', '2026-06-30')).toBe(10);
    expect(await replayBalance('u1', 'Casual', '2026-12-31')).toBe(9);
  });

  it('lets a reversal cancel its original exactly (FR-6.8)', async () => {
    await post([credit('Casual', 10)]);
    const [entry] = await post([availed('Casual', -1)], { sourceVersion: 2 });
    await reverseLedgerEntries([entry], { actor, reason: 'Leave cancelled' });

    expect(await replayBalance('u1', 'Casual', '2026-12-31')).toBe(10);
  });

  it('keeps each type independent, so Sick never moves Casual (FR-6.2)', async () => {
    await post([credit('Casual', 10), credit('Sick', 10)]);
    await post([availed('Sick', -2)], { sourceVersion: 2 });

    expect(await replayBalance('u1', 'Casual', '2026-12-31')).toBe(10);
    expect(await replayBalance('u1', 'Sick', '2026-12-31')).toBe(8);
  });

  it('replays the WFH pseudo-type like any other (D-13, FR-5.5)', async () => {
    await post([
      { entryType: 'WFH_USED', leaveType: 'WFH', amount: -1, rule: 'BR-16' },
    ]);

    expect(await replayBalance('u1', 'WFH', '2026-12-31')).toBe(-1);
  });

  it('keeps one user’s ledger out of another’s', async () => {
    await post([credit('Casual', 10)]);
    await post([credit('Casual', 4)], { userId: 'u2', sourceVersion: 2 });

    expect(await replayBalance('u1', 'Casual', '2026-12-31')).toBe(10);
    expect(await replayBalance('u2', 'Casual', '2026-12-31')).toBe(4);
  });
});

describe('listLedgerEntriesForUser', () => {
  useTestDatabase();

  it('returns every movement oldest first, so S-14 can run a balance down it', async () => {
    await post([credit('Casual', 10)], { date: '2026-01-01' });
    await post([availed('Casual', -1)], {
      date: '2026-03-04',
      sourceVersion: 2,
    });

    const entries = await listLedgerEntriesForUser('u1', {});

    expect(entries.map((entry) => entry.date)).toEqual([
      '2026-01-01',
      '2026-03-04',
    ]);
  });

  it('narrows to one leave type and to a range', async () => {
    await post([credit('Casual', 10), credit('Sick', 10)], {
      date: '2026-01-01',
    });
    await post([availed('Casual', -1)], {
      date: '2026-09-04',
      sourceVersion: 2,
    });

    expect(
      await listLedgerEntriesForUser('u1', { leaveType: 'Casual' }),
    ).toHaveLength(2);

    expect(
      await listLedgerEntriesForUser('u1', {
        from: '2026-06-01',
        to: '2026-12-31',
      }),
    ).toHaveLength(1);
  });
});

describe('summariseBalances', () => {
  useTestDatabase();

  it('breaks a balance into the movements that produced it (BR-14)', async () => {
    await post(
      [
        {
          entryType: 'OPENING_BALANCE',
          leaveType: 'Casual',
          amount: 3,
          rule: null,
        },
        credit('Casual', 10),
      ],
      { date: '2026-01-01' },
    );
    await post([availed('Casual', -1)], {
      date: '2026-03-04',
      sourceVersion: 2,
    });
    await post(
      [
        {
          entryType: 'AUTOMATIC_DEDUCTION',
          leaveType: 'Casual',
          amount: -0.25,
          rule: 'BR-9:band1',
        },
      ],
      { date: '2026-03-05', sourceVersion: 3 },
    );

    const { rows } = await summariseBalances({
      userIds: ['u1'],
      from: '2026-01-01',
      to: '2026-12-31',
    });

    const casual = rows.find(
      (row) => row.userId === 'u1' && row.leaveType === 'Casual',
    );

    expect(casual.opening).toBe(3);
    expect(casual.credited).toBe(10);
    expect(casual.availed).toBe(1);
    expect(casual.deductions).toBe(0.25);
    expect(casual.balance).toBe(11.75);
  });

  it('adds up to exactly what replayBalance says', async () => {
    await post([credit('Casual', 10)], { date: '2026-01-01' });
    await post([availed('Casual', -2)], {
      date: '2026-03-04',
      sourceVersion: 2,
    });

    const { rows } = await summariseBalances({
      userIds: ['u1'],
      from: '2026-01-01',
      to: '2026-12-31',
    });
    const casual = rows.find((row) => row.leaveType === 'Casual');

    expect(casual.balance).toBe(
      await replayBalance('u1', 'Casual', '2026-12-31'),
    );
  });

  it('returns nothing for a user with no entries at all', async () => {
    const { rows } = await summariseBalances({
      userIds: ['nobody'],
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(rows).toEqual([]);
  });
});

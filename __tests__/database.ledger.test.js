import { describe, expect, it } from 'vitest';
import {
  listLedgerEntriesForSource,
  postLedgerEntries,
  reverseLedgerEntries,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * ARCHITECTURE §19. A balance is never stored — it is replayed by summing
 * entries, and a movement is cancelled by appending its reverse, never by
 * editing or deleting the original (FR-6.8, DC-3, I-2).
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const source = {
  sourceType: 'dayRecord',
  sourceId: '64b7f9c2f1a2b3c4d5e6f7a8',
  sourceVersion: 3,
  userId: 'user-1',
  date: '2026-08-12',
  actor,
};

const deduction = {
  entryType: 'AUTOMATIC_DEDUCTION',
  leaveType: 'Casual',
  amount: -0.25,
  rule: 'BR-9:profileB:band1',
};

describe('the ledger', () => {
  useTestDatabase();

  describe('postLedgerEntries', () => {
    it('writes a signed entry carrying its source and effect key', async () => {
      const [entry] = await postLedgerEntries([deduction], source);

      expect(entry.amount).toBe(-0.25);
      expect(entry.sourceType).toBe('dayRecord');
      expect(entry.sourceVersion).toBe(3);
      expect(entry.effectKey).toContain('v3');
      expect(entry.reversalOf).toBeNull();
    });

    it('posts nothing for an empty list', async () => {
      expect(await postLedgerEntries([], source)).toEqual([]);
    });

    it('refuses the same effect twice without throwing (I-9, §19.3)', async () => {
      await postLedgerEntries([deduction], source);
      const second = await postLedgerEntries([deduction], source);

      expect(second).toEqual([]);
      expect(
        await listLedgerEntriesForSource('dayRecord', source.sourceId),
      ).toHaveLength(1);
    });

    it('permits the same movement at a new source version (a real correction)', async () => {
      await postLedgerEntries([deduction], source);
      await postLedgerEntries([{ ...deduction, amount: -0.5 }], {
        ...source,
        sourceVersion: 4,
      });

      expect(
        await listLedgerEntriesForSource('dayRecord', source.sourceId),
      ).toHaveLength(2);
    });

    it('keeps two entry types of the same day apart', async () => {
      await postLedgerEntries(
        [
          deduction,
          {
            entryType: 'LEAVE_AVAILED',
            leaveType: 'Casual',
            amount: -0.5,
            rule: 'BR-11',
          },
        ],
        source,
      );

      expect(
        await listLedgerEntriesForSource('dayRecord', source.sourceId),
      ).toHaveLength(2);
    });
  });

  describe('reverseLedgerEntries', () => {
    it('appends the mirror movement, leaving the original untouched (§19.4)', async () => {
      const [original] = await postLedgerEntries([deduction], source);
      const [reversal] = await reverseLedgerEntries([original], {
        actor,
        reason: 'Punch corrected',
      });

      expect(reversal.amount).toBe(0.25);
      expect(reversal.entryType).toBe('REVERSAL');
      expect(String(reversal.reversalOf)).toBe(String(original._id));
      expect(reversal.reason).toBe('Punch corrected');

      const all = await listLedgerEntriesForSource(
        'dayRecord',
        source.sourceId,
      );
      expect(all).toHaveLength(2);
      expect(
        all.find((entry) => String(entry._id) === String(original._id)).amount,
      ).toBe(-0.25);
    });

    it('carries no effect key, so a movement may be reversed and re-applied (§19.3)', async () => {
      const [original] = await postLedgerEntries([deduction], source);
      const [reversal] = await reverseLedgerEntries([original], {
        actor,
        reason: 'Corrected',
      });

      expect(reversal.effectKey).toBeUndefined();
    });

    it('sums to zero after a reversal, which is what replay will see (I-2)', async () => {
      const [original] = await postLedgerEntries([deduction], source);
      await reverseLedgerEntries([original], { actor, reason: 'Corrected' });

      const all = await listLedgerEntriesForSource(
        'dayRecord',
        source.sourceId,
      );
      expect(all.reduce((total, entry) => total + entry.amount, 0)).toBe(0);
    });

    it('requires a reason, because a reversal is a decision (FR-9.4)', async () => {
      const [original] = await postLedgerEntries([deduction], source);

      await expect(
        reverseLedgerEntries([original], { actor, reason: '  ' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('reverses nothing for an empty list', async () => {
      expect(await reverseLedgerEntries([], { actor, reason: 'None' })).toEqual(
        [],
      );
    });
  });
});

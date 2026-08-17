import { describe, expect, it } from 'vitest';
import {
  listImportExceptions,
  recordImportExceptions,
  resolveImportException,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `D-26`. `FR-8.6` lists "unmatched import row" among `S-05`'s twelve queues,
 * but `S-11`'s preview is client-side and ephemeral — once the tab closes,
 * a rejected row has left no trace anywhere.
 *
 * So a rejected row is persisted, and deliberately at COMMIT only: an upload
 * somebody abandoned at the preview queues nothing, because nothing about it
 * was ever asserted to be true.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const aRow = (sheetRow, reason = 'No employee code.') => ({
  sheetRow,
  employeeCode: `X-${sheetRow}`,
  fullName: `Unknown ${sheetRow}`,
  reason,
});

describe('importExceptions', () => {
  useTestDatabase();

  describe('recordImportExceptions', () => {
    it('writes one unresolved document per rejected row', async () => {
      await recordImportExceptions([aRow(2), aRow(3)], actor);

      const { items, total } = await listImportExceptions();

      expect(total).toBe(2);
      expect(items.map((item) => item.sheetRow).sort()).toEqual([2, 3]);
      expect(items.every((item) => item.resolved === false)).toBe(true);
      expect(items[0].importedBy).toBe('actor-1');
    });

    it('writes nothing for an import that rejected nothing', async () => {
      await recordImportExceptions([], actor);

      expect((await listImportExceptions()).total).toBe(0);
    });

    it('keeps the stated reason, which is the whole point of the row', async () => {
      await recordImportExceptions(
        [aRow(7, 'That employee code matches no user.')],
        actor,
      );

      const { items } = await listImportExceptions();
      expect(items[0].reason).toBe('That employee code matches no user.');
    });
  });

  describe('listImportExceptions', () => {
    it('shows the unresolved by default and the resolved only when asked', async () => {
      await recordImportExceptions([aRow(2), aRow(3)], actor);
      const { items } = await listImportExceptions();

      await resolveImportException(
        String(items[0]._id),
        'Roster corrected and the sheet re-imported',
        actor,
      );

      expect((await listImportExceptions()).total).toBe(1);
      expect((await listImportExceptions({ resolved: true })).total).toBe(1);
      expect((await listImportExceptions({ resolved: null })).total).toBe(2);
    });

    it('pages, because the backlog grows with every import (NFR-3)', async () => {
      await recordImportExceptions(
        Array.from({ length: 5 }, (_unused, index) => aRow(index + 2)),
        actor,
      );

      const page = await listImportExceptions({ page: 2, pageSize: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(5);
    });
  });

  describe('resolveImportException', () => {
    it('marks it resolved with its reason rather than deleting it (NFR-9)', async () => {
      await recordImportExceptions([aRow(2)], actor);
      const { items } = await listImportExceptions();

      const after = await resolveImportException(
        String(items[0]._id),
        'Roster corrected',
        actor,
      );

      expect(after.resolved).toBe(true);
      expect(after.reason).toBe('Roster corrected');
      expect(after.resolvedBy).toBe('actor-1');
      // Still there — an acknowledged bad row is history, not a deletion.
      expect((await listImportExceptions({ resolved: true })).total).toBe(1);
    });

    it('requires a reason, like every other acknowledgement', async () => {
      await recordImportExceptions([aRow(2)], actor);
      const { items } = await listImportExceptions();

      await expect(
        resolveImportException(String(items[0]._id), '', actor),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('answers null for an id that is not a record', async () => {
      expect(await resolveImportException('not-an-id', 'x', actor)).toBeNull();
    });
  });
});

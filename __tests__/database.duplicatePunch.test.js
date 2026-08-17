import { describe, expect, it } from 'vitest';
import {
  EXCEPTION_QUEUE,
  PUNCH_SOURCE,
  PUNCH_TYPE,
  ROLES,
} from '../constants/index.js';
import {
  acknowledgeDuplicatePunch,
  createPunch,
  createTeam,
  createUser,
  getPunchById,
  setPunchDerivedFields,
  softDeletePunch,
} from '../database.js';
import { listExceptionQueue } from '../engine/exceptions.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `P-07`, `FR-4.7`. Keep or soft delete, so a flagged pair is never double
 * counted.
 *
 * The problem this solves: `isDuplicate` is a DERIVED flag, rewritten by every
 * recalculation. "Keep" cannot clear it — the next recalculation would put it
 * straight back, and the queue would never empty. So the acknowledgement is a
 * human decision stored BESIDE the engine's flag, exactly as `DC-7` has day
 * overrides sit beside `computed`.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const range = { from: '2026-01-01', to: '2026-12-31' };

let codes = 0;

describe('duplicate punch resolution', () => {
  useTestDatabase();

  const aFlaggedPunch = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    const user = await createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `DP-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId: String(team._id),
      },
      actor,
    );

    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.IMPORT,
      },
      actor,
    );

    await setPunchDerivedFields(String(punch._id), {
      workDate: '2026-08-12',
      workDateExceptionCode: null,
      isDuplicate: true,
    });

    return await getPunchById(String(punch._id));
  };

  const queued = async () =>
    (await listExceptionQueue(EXCEPTION_QUEUE.DUPLICATE_PUNCH, range)).total;

  describe('acknowledgeDuplicatePunch', () => {
    it('takes it out of the queue while leaving the engine flag alone', async () => {
      const punch = await aFlaggedPunch();
      expect(await queued()).toBe(1);

      const after = await acknowledgeDuplicatePunch(
        String(punch._id),
        'Checked the terminal log — two genuine taps',
        actor,
      );

      expect(after.duplicateAcknowledgedAt).toBeTruthy();
      expect(after.duplicateAcknowledgedBy).toBe('actor-1');
      // The engine's own conclusion is untouched — it is still excluded from
      // pairing, and still says why.
      expect(after.isDuplicate).toBe(true);
      expect(await queued()).toBe(0);
    });

    it('survives a recalculation rewriting the derived flag (DC-7)', async () => {
      const punch = await aFlaggedPunch();
      await acknowledgeDuplicatePunch(String(punch._id), 'Checked', actor);

      // Exactly what `applyDuplicateFlags` does on the next run.
      await setPunchDerivedFields(String(punch._id), {
        workDate: '2026-08-12',
        workDateExceptionCode: null,
        isDuplicate: true,
      });

      const after = await getPunchById(String(punch._id));
      expect(after.duplicateAcknowledgedAt).toBeTruthy();
      expect(await queued()).toBe(0);
    });

    it('requires a reason, like every other decision', async () => {
      const punch = await aFlaggedPunch();

      await expect(
        acknowledgeDuplicatePunch(String(punch._id), '', actor),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('answers null for an id that is not a punch', async () => {
      expect(
        await acknowledgeDuplicatePunch('not-an-id', 'x', actor),
      ).toBeNull();
    });
  });

  describe('removing it instead', () => {
    it('leaves the queue by being soft deleted (FR-4.12)', async () => {
      const punch = await aFlaggedPunch();

      await softDeletePunch(
        String(punch._id),
        'A genuine duplicate from the terminal',
        punch.version,
        actor,
      );

      expect(await queued()).toBe(0);
      // Soft deleted, never destroyed (NFR-9).
      expect((await getPunchById(String(punch._id))).deletedAt).toBeTruthy();
    });
  });
});

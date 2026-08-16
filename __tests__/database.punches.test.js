import { describe, expect, it } from 'vitest';
import { PUNCH_SOURCE, PUNCH_TYPE, ROLES } from '../constants/index.js';
import {
  createPunch,
  createUser,
  getPunchById,
  getRecordHistory,
  listPunchesForUserDates,
  setPunchDerivedFields,
  softDeletePunch,
  updatePunch,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-4.1 and FR-4.12. A punch is the fact — one instant, one direction. Its
 * work date and duplicate flag are conclusions the engine reaches later and
 * rewrites freely, so neither is accepted from the writer.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codeCounter = 0;

const aUser = async () =>
  createUser(
    {
      fullName: 'Night Owl',
      employeeCode: `E-9${String(codeCounter++).padStart(2, '0')}`,
      employmentType: 'PERMANENT',
      tracked: true,
      loginEnabled: true,
      role: ROLES.EMPLOYEE,
      dateOfJoining: '2025-01-01',
    },
    actor,
  );

const aPunch = async (userId, overrides = {}) =>
  createPunch(
    {
      userId,
      at: '2026-08-12T04:02:00.000Z',
      type: PUNCH_TYPE.CHECK_IN,
      source: PUNCH_SOURCE.FORM,
      ...overrides,
    },
    actor,
  );

describe('punches', () => {
  useTestDatabase();

  describe('createPunch', () => {
    it('stores the instant, type and source, leaving the work date for the engine', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      expect(punch.at).toBeInstanceOf(Date);
      expect(punch.at.toISOString()).toBe('2026-08-12T04:02:00.000Z');
      expect(punch.type).toBe(PUNCH_TYPE.CHECK_IN);
      expect(punch.workDate).toBeNull();
      expect(punch.isDuplicate).toBe(false);
      expect(punch.version).toBe(1);
      expect(punch.deletedAt).toBeNull();
    });

    it('rejects a punch type that is not one of the two', async () => {
      const user = await aUser();
      await expect(
        aPunch(String(user._id), { type: 'CLOCK_IN' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects an instant that is not a real time', async () => {
      const user = await aUser();
      await expect(
        aPunch(String(user._id), { at: 'not-a-time' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('writes an audit record naming the punch', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      const history = await getRecordHistory('punch', String(punch._id));
      expect(history.map((entry) => entry.action)).toContain('PUNCH_CREATED');
    });
  });

  describe('updatePunch', () => {
    it('edits the instant in place rather than adding a cancelling punch (FR-4.12)', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      const updated = await updatePunch(
        String(punch._id),
        { at: '2026-08-12T05:02:00.000Z', reason: 'Imported an hour out' },
        punch.version,
        actor,
      );

      expect(updated.at.toISOString()).toBe('2026-08-12T05:02:00.000Z');
      expect(updated.version).toBe(2);
    });

    it('refuses a stale write', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      await expect(
        updatePunch(
          String(punch._id),
          { at: '2026-08-12T06:00:00.000Z' },
          99,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'StaleWriteError' });
    });

    it('returns null for an id that does not exist', async () => {
      expect(
        await updatePunch(
          '64b7f9c2f1a2b3c4d5e6f7a8',
          { at: '2026-08-12T04:00:00.000Z' },
          1,
          actor,
        ),
      ).toBeNull();
    });

    it('rejects a patch that changes nothing', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      await expect(
        updatePunch(
          String(punch._id),
          { reason: 'Just because' },
          punch.version,
          actor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('softDeletePunch', () => {
    it('marks it deleted and keeps the row (I-1)', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      const deleted = await softDeletePunch(
        String(punch._id),
        'Punched for the wrong person',
        punch.version,
        actor,
      );

      expect(deleted.deletedAt).toBeInstanceOf(Date);
      expect(await getPunchById(String(punch._id))).not.toBeNull();
    });
  });

  describe('setPunchDerivedFields', () => {
    it('stores the resolved work date without bumping the version or auditing', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));

      await setPunchDerivedFields(String(punch._id), {
        workDate: '2026-08-12',
        workDateExceptionCode: null,
        isDuplicate: false,
      });

      const after = await getPunchById(String(punch._id));
      expect(after.workDate).toBe('2026-08-12');
      expect(after.version).toBe(punch.version);
    });

    it('finds the punch by its resolved work date afterwards', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));
      await setPunchDerivedFields(String(punch._id), {
        workDate: '2026-08-12',
        workDateExceptionCode: null,
        isDuplicate: false,
      });

      const found = await listPunchesForUserDates(String(user._id), [
        '2026-08-12',
      ]);
      expect(found.map((row) => String(row._id))).toEqual([String(punch._id)]);
    });

    it('excludes soft-deleted punches unless asked for them', async () => {
      const user = await aUser();
      const punch = await aPunch(String(user._id));
      await setPunchDerivedFields(String(punch._id), {
        workDate: '2026-08-12',
        workDateExceptionCode: null,
        isDuplicate: false,
      });
      await softDeletePunch(
        String(punch._id),
        'Wrong person',
        punch.version,
        actor,
      );

      expect(
        await listPunchesForUserDates(String(user._id), ['2026-08-12']),
      ).toHaveLength(0);
      expect(
        await listPunchesForUserDates(String(user._id), ['2026-08-12'], {
          includeDeleted: true,
        }),
      ).toHaveLength(1);
    });
  });
});

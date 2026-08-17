import { describe, expect, it } from 'vitest';
import { PUNCH_SOURCE, ROLES } from '../constants/index.js';
import {
  commitAttendanceImport,
  createTeam,
  createUser,
  listPunchesInInstantRange,
  loadImportContext,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-4.5: every accepted row is written or none is. That is a guarantee about
 * the observable outcome — a partially applied import must never be
 * queryable — not a promise about the number of database calls.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('the attendance import', () => {
  useTestDatabase();

  const aUser = async (overrides = {}) => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `I-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        ...overrides,
      },
      actor,
    );
  };

  const rowsFor = (userId) => [
    {
      userId,
      at: '2026-08-12T04:02:00.000Z',
      type: 'CHECK_IN',
      employeeCode: 'I-000',
    },
    {
      userId,
      at: '2026-08-12T13:04:00.000Z',
      type: 'CHECK_OUT',
      employeeCode: 'I-000',
    },
  ];

  describe('loadImportContext', () => {
    it('returns the users those codes belong to, keyed by code', async () => {
      const user = await aUser();

      const { usersByCode } = await loadImportContext({
        codes: [user.employeeCode, 'NOT-A-CODE'],
      });

      expect(usersByCode.get(user.employeeCode).fullName).toBe(user.fullName);
      expect(usersByCode.has('NOT-A-CODE')).toBe(false);
    });

    it('carries the tenures and shift timezone the validator needs', async () => {
      const user = await aUser();

      const { usersByCode } = await loadImportContext({
        codes: [user.employeeCode],
      });
      const loaded = usersByCode.get(user.employeeCode);

      expect(loaded.tenures).toHaveLength(1);
      expect(loaded).toHaveProperty('timezone');
      expect(loaded).toHaveProperty('tracked', true);
    });

    it('includes an untracked user, so the validator can reject them by name', async () => {
      const user = await aUser({ tracked: false });

      const { usersByCode } = await loadImportContext({
        codes: [user.employeeCode],
      });

      expect(usersByCode.get(user.employeeCode).tracked).toBe(false);
    });
  });

  describe('commitAttendanceImport', () => {
    it('writes every row as an imported punch', async () => {
      const user = await aUser();
      const userId = String(user._id);

      const result = await commitAttendanceImport(rowsFor(userId), actor);

      expect(result.inserted).toBe(2);

      const stored = await listPunchesInInstantRange(
        userId,
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-08-31T00:00:00Z'),
      );

      expect(stored).toHaveLength(2);
      expect(
        stored.every((punch) => punch.source === PUNCH_SOURCE.IMPORT),
      ).toBe(true);
      expect(stored[0].workDate).toBeNull(); // the engine resolves it
    });

    it('reports the users and dates the caller must recalculate', async () => {
      const user = await aUser();
      const userId = String(user._id);

      const result = await commitAttendanceImport(rowsFor(userId), actor);

      expect(result.userIds).toEqual([userId]);
      expect(result.dates).toContain('2026-08-12');
    });

    it('writes an audit record naming the import', async () => {
      const user = await aUser();
      await commitAttendanceImport(rowsFor(String(user._id)), actor);

      const { listAuditRecords } = await import('../database.js');
      const { items } = await listAuditRecords({ pageSize: 50 });

      expect(items.map((entry) => entry.action)).toContain(
        'ATTENDANCE_IMPORTED',
      );
    });

    it('writes nothing at all when a row is malformed (FR-4.5)', async () => {
      const user = await aUser();
      const userId = String(user._id);

      const rows = [
        ...rowsFor(userId),
        { userId, at: 'not-an-instant', type: 'CHECK_IN' },
      ];

      await expect(commitAttendanceImport(rows, actor)).rejects.toThrow();

      const stored = await listPunchesInInstantRange(
        userId,
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-08-31T00:00:00Z'),
      );

      expect(stored).toHaveLength(0);
    });

    it('commits nothing for an empty list', async () => {
      const result = await commitAttendanceImport([], actor);

      expect(result).toEqual({ inserted: 0, userIds: [], dates: [] });
    });
  });
});

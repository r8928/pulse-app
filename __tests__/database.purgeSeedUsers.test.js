import { describe, expect, it } from 'vitest';
import { PUNCH_SOURCE, PUNCH_TYPE, ROLES } from '../constants/index.js';
import {
  changeUserRole,
  createPunch,
  createTeam,
  createUser,
  getTeamById,
  getUserById,
  listAuditRecords,
  listUserDatedRecords,
  purgeSeedUsers,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * Seed maintenance only: the one path in the system that removes a person
 * outright rather than soft deleting them (`FR-2.2` still holds for every
 * application path — no route reaches this).
 *
 * It exists because seeding only ever upserts, so a demo row invented for
 * testing can otherwise never leave the database.
 */

const actor = { userId: 'actor-1', name: 'Ahmar Ali' };

const user = (overrides = {}) =>
  createUser(
    {
      fullName: 'Demo Person',
      employeeCode: 'DEMO-001',
      employmentType: 'PERMANENT',
      tracked: true,
      loginEnabled: false,
      role: ROLES.EMPLOYEE,
      dateOfJoining: '2026-01-05',
      ...overrides,
    },
    actor,
  );

describe('purgeSeedUsers', () => {
  useTestDatabase();

  it('removes the user outright rather than soft deleting them', async () => {
    const demo = await user();

    const { removedUsers } = await purgeSeedUsers(['DEMO-001']);

    expect(removedUsers).toBe(1);
    expect(await getUserById(String(demo._id))).toBeNull();
  });

  it('removes the dated records that hang off the user', async () => {
    const demo = await user();
    await createPunch(
      {
        userId: String(demo._id),
        at: '2026-02-02T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );

    await purgeSeedUsers(['DEMO-001']);

    expect(await listUserDatedRecords(String(demo._id))).toEqual([]);
  });

  it('clears the manager reference on a team the purged user ran', async () => {
    const team = await createTeam({ name: 'GC' }, actor);
    const demo = await user({ teamId: String(team._id) });
    await changeUserRole(
      String(demo._id),
      {
        role: ROLES.MANAGER,
        teamId: String(team._id),
        reason: 'Runs GC',
      },
      demo.version,
      actor,
    );

    const { teamsCleared } = await purgeSeedUsers(['DEMO-001']);

    expect(teamsCleared).toBe(1);
    expect((await getTeamById(String(team._id))).managerId).toBeNull();
  });

  it('leaves users it was not asked to purge untouched', async () => {
    const kept = await user({
      employeeCode: 'ADM-001',
      fullName: 'Ahmar Ali',
    });
    await user();

    await purgeSeedUsers(['DEMO-001']);

    expect(await getUserById(String(kept._id))).not.toBeNull();
  });

  it('leaves the audit trail of the purged user standing', async () => {
    // FR-9.3: append only without exception. What a person did survives them.
    await user();

    await purgeSeedUsers(['DEMO-001']);

    const { items } = await listAuditRecords({ entityType: 'user' });
    expect(items).not.toHaveLength(0);
  });

  it('refuses an employee code that matches nobody, purging nothing', async () => {
    // A typo in a destructive one-off must fail loudly, not half-succeed.
    const demo = await user();

    await expect(purgeSeedUsers(['DEMO-001', 'NOPE-999'])).rejects.toThrow(
      ValidationError,
    );
    expect(await getUserById(String(demo._id))).not.toBeNull();
  });

  it('refuses an empty list of employee codes', async () => {
    await expect(purgeSeedUsers([])).rejects.toThrow(ValidationError);
  });
});

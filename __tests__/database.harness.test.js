import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createUser,
  listUsers,
  StaleWriteError,
  softDeleteUser,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * Proves the D-6 harness by making four assertions a mocked driver cannot: a
 * unique index that actually rejects, a filter that actually excludes, a
 * version check that actually fails, and a database that is actually empty
 * between tests.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const user = (overrides = {}) => ({
  fullName: 'Alice Adeyemi',
  employeeCode: 'EMP-001',
  employmentType: 'PERMANENT',
  tracked: true,
  loginEnabled: true,
  role: ROLES.EMPLOYEE,
  dateOfJoining: '2026-01-05',
  ...overrides,
});

describe('the test database', () => {
  useTestDatabase();

  it('rejects a duplicate employee code, including against a soft-deleted user', async () => {
    // FR-2.6: unique across all users, so a departed user's records are never
    // reattached to a new joiner.
    const created = await createUser(user(), actor);
    await softDeleteUser(
      String(created._id),
      { dateOfLeaving: '2026-06-30', reason: 'Left the company' },
      actor,
      created.version,
    );

    await expect(
      createUser(user({ fullName: 'Bob Brand' }), actor),
    ).rejects.toThrow();
  });

  it('counts soft-deleted users in the roster but not in the active count', async () => {
    // Totals exclude, rosters include (ARCHITECTURE 5.2).
    const kept = await createUser(user(), actor);
    await createUser(
      user({ employeeCode: 'EMP-002', fullName: 'Bob Brand' }),
      actor,
    );
    await softDeleteUser(
      String(kept._id),
      { dateOfLeaving: '2026-06-30', reason: 'Left the company' },
      actor,
      kept.version,
    );

    const { total, activeCount } = await listUsers();
    expect(total).toBe(2);
    expect(activeCount).toBe(1);
  });

  it('rejects a second write against the version the first one consumed', async () => {
    const created = await createUser(user(), actor);
    const body = { dateOfLeaving: '2026-06-30', reason: 'Left the company' };

    await softDeleteUser(String(created._id), body, actor, created.version);

    await expect(
      softDeleteUser(String(created._id), body, actor, created.version),
    ).rejects.toThrow(StaleWriteError);
  });

  it('empties the database between tests', async () => {
    const { total } = await listUsers();
    expect(total).toBe(0);
  });
});

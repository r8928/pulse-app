import { describe, expect, it } from 'vitest';
import { resolveScope } from '../authz/check.js';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import {
  getPermissionGrants,
  listPermissionGrants,
  StaleWriteError,
  setPermissionGrant,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-1.2's FGAC half: every permission and the scope each role holds it at is
 * stored as data, so S-19 can move a grant with no code change.
 *
 * FR-1.3 is deliberately NOT enforced here — it is a rule about the whole
 * matrix, so the route validates the resulting set before calling in.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('permission grants', () => {
  useTestDatabase();

  it('creates a row for a cell that has none, at version 1', async () => {
    const grant = await setPermissionGrant(
      {
        role: ROLES.EMPLOYEE,
        permission: PERMISSIONS.CONFIG_READ,
        scope: SCOPES.SELF,
      },
      null,
      actor,
    );

    expect(grant).toMatchObject({ scope: SCOPES.SELF, version: 1 });
    expect((await listPermissionGrants()).total).toBe(1);
  });

  it('narrows an existing scope and bumps the version', async () => {
    await setPermissionGrant(
      {
        role: ROLES.MANAGER,
        permission: PERMISSIONS.LEAVE_APPROVE,
        scope: SCOPES.ALL,
      },
      null,
      actor,
    );

    const narrowed = await setPermissionGrant(
      {
        role: ROLES.MANAGER,
        permission: PERMISSIONS.LEAVE_APPROVE,
        scope: SCOPES.TEAM,
      },
      1,
      actor,
    );

    expect(narrowed).toMatchObject({ scope: SCOPES.TEAM, version: 2 });
  });

  it('stores a withheld permission as a null scope rather than removing the row', async () => {
    // Design record D-8: nothing is destroyed (I-1), and the row keeps its
    // version for the next edit and its before/after for the audit.
    await setPermissionGrant(
      {
        role: ROLES.EMPLOYEE,
        permission: PERMISSIONS.LEAVE_READ,
        scope: SCOPES.ALL,
      },
      null,
      actor,
    );

    const withheld = await setPermissionGrant(
      { role: ROLES.EMPLOYEE, permission: PERMISSIONS.LEAVE_READ, scope: null },
      1,
      actor,
    );

    expect(withheld.scope).toBeNull();
    expect((await listPermissionGrants()).total).toBe(1);
  });

  it('is read as holding nothing once the scope is null', async () => {
    await setPermissionGrant(
      { role: ROLES.EMPLOYEE, permission: PERMISSIONS.LEAVE_READ, scope: null },
      null,
      actor,
    );

    const grants = await getPermissionGrants();
    expect(
      resolveScope(grants, ROLES.EMPLOYEE, PERMISSIONS.LEAVE_READ),
    ).toBeNull();
  });

  it('rejects a second edit against the version the first one consumed', async () => {
    await setPermissionGrant(
      {
        role: ROLES.IT,
        permission: PERMISSIONS.USER_WRITE,
        scope: SCOPES.ALL,
      },
      null,
      actor,
    );
    await setPermissionGrant(
      {
        role: ROLES.IT,
        permission: PERMISSIONS.USER_WRITE,
        scope: SCOPES.TEAM,
      },
      1,
      actor,
    );

    await expect(
      setPermissionGrant(
        {
          role: ROLES.IT,
          permission: PERMISSIONS.USER_WRITE,
          scope: SCOPES.SELF,
        },
        1,
        actor,
      ),
    ).rejects.toThrow(StaleWriteError);
  });

  it('rejects an unknown scope', async () => {
    await expect(
      setPermissionGrant(
        {
          role: ROLES.IT,
          permission: PERMISSIONS.USER_WRITE,
          scope: 'EVERYTHING',
        },
        null,
        actor,
      ),
    ).rejects.toThrow();
  });

  it('rejects a fifth role, which FR-1.3 makes a schema change', async () => {
    await expect(
      setPermissionGrant(
        {
          role: 'SUPERVISOR',
          permission: PERMISSIONS.USER_READ,
          scope: SCOPES.ALL,
        },
        null,
        actor,
      ),
    ).rejects.toThrow();
  });
});

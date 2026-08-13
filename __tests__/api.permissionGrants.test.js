import { describe, expect, it, vi } from 'vitest';
import { resolveScope } from '../authz/check.js';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { getPermissionGrants, setPermissionGrant } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * S-19 and P-42, and the FR-1.3 guarantee.
 *
 * The point of these tests is that the server is the control: every rejection
 * below holds regardless of what the client sends, and the locked OFFICE_ADMIN
 * column on the screen is only a courtesy.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const { GET, PATCH } = await import('../app/api/permission-grants/route.js');

const held = (...names) =>
  Object.fromEntries(names.map((name) => [name, SCOPES.ALL]));

const signedInAs = (permissions) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Office Administrator',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
  });

const json = (body) =>
  new Request('http://localhost/api/permission-grants', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

/** FR-1.3: OFFICE_ADMIN holds every permission the system defines, at ALL. */
const seedOfficeAdmin = () =>
  Promise.all(
    ALL_PERMISSIONS.map((permission) =>
      setPermissionGrant(
        { role: ROLES.OFFICE_ADMIN, permission, scope: SCOPES.ALL },
        null,
        actor,
      ),
    ),
  );

describe('/api/permission-grants', () => {
  useTestDatabase();

  it('answers 403 for a viewer without permission.write', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_WRITE));

    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      permission: PERMISSIONS.PERMISSION_WRITE,
    });
  });

  it('grants a permission to a role and answers 200', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: ROLES.IT,
        permission: PERMISSIONS.AUDIT_READ,
        scope: SCOPES.ALL,
        reason: 'IT now triages sign-in failures',
        version: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scope: SCOPES.ALL });
  });

  it('takes effect on the very next request, with no restart', async () => {
    // MVP criterion 7, and the whole point of FR-1.2's FGAC half.
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    expect(
      resolveScope(
        await getPermissionGrants(),
        ROLES.EMPLOYEE,
        PERMISSIONS.AUDIT_READ,
      ),
    ).toBeNull();

    await PATCH(
      json({
        role: ROLES.EMPLOYEE,
        permission: PERMISSIONS.AUDIT_READ,
        scope: SCOPES.SELF,
        reason: 'Employees may read their own history',
        version: null,
      }),
    );

    expect(
      resolveScope(
        await getPermissionGrants(),
        ROLES.EMPLOYEE,
        PERMISSIONS.AUDIT_READ,
      ),
    ).toBe(SCOPES.SELF);
  });

  it('rejects removing a permission from OFFICE_ADMIN, naming the permission', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: ROLES.OFFICE_ADMIN,
        permission: PERMISSIONS.AUDIT_READ,
        scope: null,
        reason: 'Trying it on',
        version: 1,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(
      /OFFICE_ADMIN must hold audit\.read/,
    );
  });

  it('rejects narrowing OFFICE_ADMIN below ALL', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: ROLES.OFFICE_ADMIN,
        permission: PERMISSIONS.USER_READ,
        scope: SCOPES.TEAM,
        reason: 'Trying it on',
        version: 1,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/cannot be narrowed/i);
  });

  it('leaves the stored grant untouched when validation rejects the change', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    await PATCH(
      json({
        role: ROLES.OFFICE_ADMIN,
        permission: PERMISSIONS.USER_READ,
        scope: null,
        reason: 'Trying it on',
        version: 1,
      }),
    );

    expect(
      resolveScope(
        await getPermissionGrants(),
        ROLES.OFFICE_ADMIN,
        PERMISSIONS.USER_READ,
      ),
    ).toBe(SCOPES.ALL);
  });

  it('rejects a fifth role', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: 'SUPERVISOR',
        permission: PERMISSIONS.USER_READ,
        scope: SCOPES.ALL,
        reason: 'A fifth role',
        version: null,
      }),
    );

    expect(response.status).toBe(400);
  });

  it('answers 409 carrying the current state on a stale cell edit', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const cell = {
      role: ROLES.IT,
      permission: PERMISSIONS.AUDIT_READ,
      reason: 'Change',
      version: 1,
    };

    await PATCH(json({ ...cell, scope: SCOPES.ALL, version: null }));
    await PATCH(json({ ...cell, scope: SCOPES.TEAM }));

    const response = await PATCH(json({ ...cell, scope: SCOPES.SELF }));
    expect(response.status).toBe(409);
    expect((await response.json()).current).toMatchObject({
      scope: SCOPES.TEAM,
    });
  });

  it('lists every stored grant with its version, for the matrix to write back', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const body = await (await GET()).json();
    expect(body.total).toBe(ALL_PERMISSIONS.length);
    expect(body.items[0]).toMatchObject({ version: 1 });
  });
});

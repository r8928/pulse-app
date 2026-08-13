import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { createEmploymentType } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The server half of the P-40 contract. The client half is asserted in
 * `hooks/__tests__/useConfigMutations.test.jsx`, and the two must agree.
 *
 * proxy.js has already gated the path on config.read before any of this runs.
 * These handlers assert the permission their *method* needs, which the path
 * alone cannot express.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const { GET, POST } = await import('../app/api/employment-types/route.js');
const { PATCH } = await import('../app/api/employment-types/[id]/route.js');
const { POST: SOFT_DELETE } = await import(
  '../app/api/employment-types/[id]/soft-delete/route.js'
);

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
  new Request('http://localhost/api/employment-types', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('/api/employment-types', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await GET(json({}))).status).toBe(401);
  });

  it('answers 403 naming the permission when the reader lacks config.read', async () => {
    signedInAs(held(PERMISSIONS.USER_READ));

    const response = await GET(json({}));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      permission: PERMISSIONS.CONFIG_READ,
    });
  });

  it('lists types for a reader holding config.read', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    await createEmploymentType({ name: 'PERMANENT' }, actor);

    const response = await GET(json({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1 });
  });

  it('answers 403 on a create by a reader who holds only config.read', async () => {
    // proxy.js gates the path on config.read; only the handler knows a POST
    // needs config.write.
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    expect((await POST(json({ name: 'CONTRACT' }))).status).toBe(403);
  });

  it('creates and answers 201 with the document', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ name: 'CONTRACT' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: 'CONTRACT',
      version: 1,
    });
  });

  it('answers 400 with the specific message on an invalid name', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ name: '' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/name is required/i);
  });

  it('answers 400 naming the duplicate rather than failing as an unknown error', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    await createEmploymentType({ name: 'CONTRACT' }, actor);

    const response = await POST(json({ name: 'CONTRACT' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/CONTRACT already exists/);
  });

  it('answers 409 carrying the current state on a stale rename', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    const created = await createEmploymentType({ name: 'CONTRACT' }, actor);
    const params = Promise.resolve({ id: String(created._id) });

    await PATCH(json({ name: 'A', version: 1 }), { params });
    const response = await PATCH(json({ name: 'B', version: 1 }), { params });

    expect(response.status).toBe(409);
    expect((await response.json()).current).toMatchObject({ name: 'A' });
  });

  it('answers 404 for an id that does not exist', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await PATCH(json({ name: 'A', version: 1 }), {
      params: Promise.resolve({ id: '000000000000000000000000' }),
    });
    expect(response.status).toBe(404);
  });

  it('soft deletes, and refuses to without a reason', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    const created = await createEmploymentType({ name: 'INTERN' }, actor);
    const params = Promise.resolve({ id: String(created._id) });

    const rejected = await SOFT_DELETE(json({ reason: '', version: 1 }), {
      params,
    });
    expect(rejected.status).toBe(400);

    const accepted = await SOFT_DELETE(
      json({ reason: 'No longer used', version: 1 }),
      { params },
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).deletedAt).not.toBeNull();
  });
});

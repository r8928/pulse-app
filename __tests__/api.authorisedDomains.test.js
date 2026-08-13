import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { createAuthorisedDomain } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The server half of the P-41 contract. The client half is asserted in
 * `hooks/__tests__/useConfigMutations.test.jsx`.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const { GET, POST } = await import('../app/api/authorised-domains/route.js');
const { POST: SOFT_DELETE } = await import(
  '../app/api/authorised-domains/[id]/soft-delete/route.js'
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
  new Request('http://localhost/api/authorised-domains', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('/api/authorised-domains', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await GET(json({}))).status).toBe(401);
  });

  it('lists domains for a reader holding config.read', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    await createAuthorisedDomain({ domain: 'example.com' }, actor);

    const response = await GET(json({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1 });
  });

  it('adds a domain and answers 201', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ domain: 'example.com' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ domain: 'example.com' });
  });

  it('answers 400 naming the mistake when given an email address', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ domain: 'someone@example.com' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not an email address/i);
  });

  it('answers 400 rather than removing the last domain', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    const only = await createAuthorisedDomain({ domain: 'example.com' }, actor);

    const response = await SOFT_DELETE(
      json({ reason: 'Wrong domain', version: only.version }),
      { params: Promise.resolve({ id: String(only._id) }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/last authorised domain/i);
  });

  it('answers 403 on a write by a reader holding only config.read', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    expect((await POST(json({ domain: 'example.com' }))).status).toBe(403);
  });

  it('answers 404 for an id that does not exist', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await SOFT_DELETE(json({ reason: 'Gone', version: 1 }), {
      params: Promise.resolve({ id: '000000000000000000000000' }),
    });
    expect(response.status).toBe(404);
  });
});

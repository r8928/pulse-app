import { describe, expect, it, vi } from 'vitest';
import {
  HOLIDAY_TYPE,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { createShift, createTeam, createUser } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The server half of the M-6 contracts.
 *
 * `team.read` reaches the roster; `team.write` creates and edits a team;
 * `config.write` edits everything inside one. proxy.js gates the path on
 * team.read and each handler asserts what its own method needs.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const teamsRoute = await import('../app/api/teams/route.js');
const teamRoute = await import('../app/api/teams/[id]/route.js');
const teamDeleteRoute = await import(
  '../app/api/teams/[id]/soft-delete/route.js'
);
const policyRoute = await import('../app/api/teams/[id]/policy/route.js');
const weeklyOffRoute = await import(
  '../app/api/teams/[id]/weekly-off/route.js'
);
const shiftsRoute = await import('../app/api/shifts/route.js');
const holidaysRoute = await import('../app/api/holidays/route.js');

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
  new Request('http://localhost/api/teams', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };
const params = (id) => ({ params: Promise.resolve({ id }) });

const admin = () =>
  signedInAs(
    held(
      PERMISSIONS.TEAM_READ,
      PERMISSIONS.TEAM_WRITE,
      PERMISSIONS.CONFIG_READ,
      PERMISSIONS.CONFIG_WRITE,
    ),
  );

describe('/api/teams', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await teamsRoute.GET(json({}))).status).toBe(401);
  });

  it('lists teams for a reader holding team.read', async () => {
    signedInAs(held(PERMISSIONS.TEAM_READ));
    await createTeam({ name: 'General' }, actor);

    const response = await teamsRoute.GET(json({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1 });
  });

  it('answers 403 on a create by a reader holding only team.read', async () => {
    signedInAs(held(PERMISSIONS.TEAM_READ));
    expect((await teamsRoute.POST(json({ name: 'GC' }))).status).toBe(403);
  });

  it('creates and answers 201', async () => {
    admin();

    const response = await teamsRoute.POST(json({ name: 'GC' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'GC', version: 1 });
  });

  it('answers 400 naming the clash on a duplicate team name', async () => {
    admin();
    await createTeam({ name: 'General' }, actor);

    const response = await teamsRoute.POST(json({ name: 'General' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/General already exists/);
  });

  it('answers 409 with the current state on a stale edit', async () => {
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    await teamRoute.PATCH(
      json({ name: 'A', version: 1 }),
      params(String(team._id)),
    );
    const response = await teamRoute.PATCH(
      json({ name: 'B', version: 1 }),
      params(String(team._id)),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).current).toMatchObject({ name: 'A' });
  });

  it('answers 400 naming the members blocking a soft delete', async () => {
    // FR-3.2: they are moved first, not deleted.
    admin();
    const team = await createTeam({ name: 'General' }, actor);
    await createUser(
      {
        fullName: 'Rosa Delgado',
        employeeCode: 'SUP-001',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-05',
        teamId: String(team._id),
      },
      actor,
    );

    const response = await teamDeleteRoute.POST(
      json({ reason: 'Reorganised', version: team.version }),
      params(String(team._id)),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Rosa Delgado/);
  });

  it('answers 404 for a team that does not exist', async () => {
    admin();

    const response = await teamRoute.PATCH(
      json({ name: 'A', version: 1 }),
      params('000000000000000000000000'),
    );
    expect(response.status).toBe(404);
  });

  it('returns the whole configuration, gaps included, on GET', async () => {
    // FR-3.13: S-17 flags what is unset rather than defaulting it.
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    const response = await teamRoute.GET(json({}), params(String(team._id)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.team.name).toBe('General');
    expect(body.gaps.length).toBeGreaterThan(0);
  });
});

describe('/api/teams/[id]/policy and weekly-off', () => {
  useTestDatabase();

  it('stores a policy value and requires config.write to do it', async () => {
    const team = await createTeam({ name: 'General' }, actor);

    signedInAs(held(PERMISSIONS.TEAM_READ, PERMISSIONS.CONFIG_READ));
    expect(
      (
        await policyRoute.PUT(
          json({ ptoValidityDays: 30, version: null }),
          params(String(team._id)),
        )
      ).status,
    ).toBe(403);

    admin();
    const response = await policyRoute.PUT(
      json({ ptoValidityDays: 30, version: null }),
      params(String(team._id)),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ptoValidityDays: 30 });
  });

  it('sets a weekly off pattern that is not the weekend', async () => {
    // FR-3.8.
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    const response = await weeklyOffRoute.PUT(
      json({ daysOfWeek: [5, 6], version: null }),
      params(String(team._id)),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).daysOfWeek).toEqual([5, 6]);
  });
});

describe('/api/shifts and /api/holidays', () => {
  useTestDatabase();

  it('creates a shift for a team and lists it back', async () => {
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    const created = await shiftsRoute.POST(
      json({
        teamId: String(team._id),
        name: 'Day',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      }),
    );
    expect(created.status).toBe(201);

    const listed = await shiftsRoute.GET(
      new Request(`http://localhost/api/shifts?teamId=${team._id}`),
    );
    expect(await listed.json()).toMatchObject({ total: 1 });
  });

  it('answers 400 when a shift is offered no timezone', async () => {
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    const response = await shiftsRoute.POST(
      json({
        teamId: String(team._id),
        name: 'Day',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: '',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/timezone is required/i);
  });

  it('answers 400 rather than removing a team default shift', async () => {
    admin();
    const team = await createTeam({ name: 'General' }, actor);
    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Day',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );
    await teamRoute.PATCH(
      json({ defaultShiftId: String(shift._id), version: team.version }),
      params(String(team._id)),
    );

    const shiftDeleteRoute = await import(
      '../app/api/shifts/[id]/soft-delete/route.js'
    );
    const response = await shiftDeleteRoute.POST(
      json({ reason: 'Replaced', version: shift.version }),
      params(String(shift._id)),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/default shift/i);
  });

  it('creates a typed holiday and answers 201', async () => {
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    const response = await holidaysRoute.POST(
      json({
        teamId: String(team._id),
        date: '2026-03-23',
        name: 'Public holiday',
        type: HOLIDAY_TYPE.PUBLIC,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ type: HOLIDAY_TYPE.PUBLIC });
  });

  it('answers 400 for an untyped holiday', async () => {
    admin();
    const team = await createTeam({ name: 'General' }, actor);

    const response = await holidaysRoute.POST(
      json({
        teamId: String(team._id),
        date: '2026-03-23',
        name: 'Something',
        type: 'BANK_HOLIDAY',
      }),
    );

    expect(response.status).toBe(400);
  });
});

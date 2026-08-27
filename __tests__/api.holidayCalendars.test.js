import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../authz/routes.js';
import {
  HOLIDAY_TYPE,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The server half of the `S-26` contracts.
 *
 * `config.read` reaches the list; `config.write` creates, renames, removes,
 * assigns teams and edits the calendar's contents. proxy.js gates the path on
 * config.read and each handler asserts what its own method needs — the same
 * split the team routes use.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));
vi.mock('../engine/recalculate.js', () => ({
  recalculateDays: vi.fn().mockResolvedValue({ updated: 0 }),
}));

const { getSessionUser } = await import('../session.js');
const { recalculateDays } = await import('../engine/recalculate.js');
const { createHolidayCalendar, createTeam, setCalendarTeams } = await import(
  '../database.js'
);

const calendarsRoute = await import('../app/api/holiday-calendars/route.js');
const calendarRoute = await import(
  '../app/api/holiday-calendars/[id]/route.js'
);
const deleteRoute = await import(
  '../app/api/holiday-calendars/[id]/soft-delete/route.js'
);
const assignRoute = await import(
  '../app/api/holiday-calendars/[id]/teams/route.js'
);
const weeklyOffRoute = await import(
  '../app/api/holiday-calendars/[id]/weekly-off/route.js'
);
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

const admin = () =>
  signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

const actor = { userId: 'actor-1', name: 'Office Administrator' };
const params = (id) => ({ params: Promise.resolve({ id }) });

const request = (body, method = 'POST') =>
  new Request('http://localhost/api/holiday-calendars', {
    method,
    // A GET carries no body — the runtime refuses to construct one that does.
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });

describe('/api/holiday-calendars', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await calendarsRoute.GET(request({}, 'GET'))).status).toBe(401);
  });

  it('answers 403 to a reader holding no config.read', async () => {
    signedInAs(held(PERMISSIONS.TEAM_READ));
    expect((await calendarsRoute.GET(request({}, 'GET'))).status).toBe(403);
  });

  it('lists calendars with the teams assigned to each', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const response = await calendarsRoute.GET(request({}, 'GET'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].teams).toEqual([
      { _id: String(general._id), name: 'General' },
    ]);
  });

  it('creates a calendar for a writer, and answers 201', async () => {
    admin();
    const response = await calendarsRoute.POST(request({ name: 'India' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'India', version: 1 });
  });

  it('answers 403 to a reader trying to create one', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    expect((await calendarsRoute.POST(request({ name: 'India' }))).status).toBe(
      403,
    );
  });

  it('answers 400 with the reason when the name is taken', async () => {
    admin();
    await createHolidayCalendar({ name: 'India' }, actor);

    const response = await calendarsRoute.POST(request({ name: 'India' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/already exists/i);
  });

  it('renames a calendar and answers 404 for one that is not there', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);

    const renamed = await calendarRoute.PATCH(
      request({ name: 'India and Sri Lanka', version: india.version }, 'PATCH'),
      params(String(india._id)),
    );
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: 'India and Sri Lanka' });

    const missing = await calendarRoute.PATCH(
      request({ name: 'Nowhere', version: 1 }, 'PATCH'),
      params('64b7f9c2a1b2c3d4e5f60718'),
    );
    expect(missing.status).toBe(404);
  });
});

describe('PUT /api/holiday-calendars/[id]/teams', () => {
  useTestDatabase();

  it('recalculates both the team joining and the team leaving', async () => {
    // D-31. A team leaving loses the holidays it was classified against, so
    // its day types change exactly as much as a joining team's do.
    admin();
    recalculateDays.mockClear();

    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    const support = await createTeam({ name: 'Support' }, actor);
    await setCalendarTeams(String(india._id), [String(support._id)], actor);

    const response = await assignRoute.PUT(
      request({ teamIds: [String(general._id)] }, 'PUT'),
      params(String(india._id)),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      joined: [String(general._id)],
      left: [String(support._id)],
    });

    const recalculated = recalculateDays.mock.calls.map(
      ([, , options]) => options.teamId,
    );
    expect(recalculated.sort()).toEqual(
      [String(general._id), String(support._id)].sort(),
    );
  });

  it('answers 404 for a calendar that is not there', async () => {
    admin();
    const response = await assignRoute.PUT(
      request({ teamIds: [] }, 'PUT'),
      params('64b7f9c2a1b2c3d4e5f60718'),
    );
    expect(response.status).toBe(404);
  });

  it('answers 403 to a reader', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    const response = await assignRoute.PUT(
      request({ teamIds: [] }, 'PUT'),
      params('64b7f9c2a1b2c3d4e5f60718'),
    );
    expect(response.status).toBe(403);
  });
});

describe('POST /api/holiday-calendars/[id]/soft-delete', () => {
  useTestDatabase();

  it('answers 400 naming the teams while any is assigned', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const response = await deleteRoute.POST(
      request({ reason: 'Merging', version: india.version }),
      params(String(india._id)),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/General/);
  });

  it('removes a calendar no team is assigned to', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);

    const response = await deleteRoute.POST(
      request({ reason: 'No longer used', version: india.version }),
      params(String(india._id)),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).deletedAt).not.toBeNull();
  });
});

describe('a calendar mutation fans out over every assigned team', () => {
  useTestDatabase();

  it('recalculates each assigned team when a holiday is added', async () => {
    admin();
    recalculateDays.mockClear();

    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    const support = await createTeam({ name: 'Support' }, actor);
    await setCalendarTeams(
      String(india._id),
      [String(general._id), String(support._id)],
      actor,
    );

    const response = await holidaysRoute.POST(
      request({
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      }),
    );

    expect(response.status).toBe(201);
    expect(recalculateDays).toHaveBeenCalledTimes(2);
  });

  it('recalculates each assigned team when the weekly off changes', async () => {
    admin();
    recalculateDays.mockClear();

    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const response = await weeklyOffRoute.PUT(
      request({ daysOfWeek: [0, 6], version: null }, 'PUT'),
      params(String(india._id)),
    );

    expect(response.status).toBe(200);
    expect(recalculateDays).toHaveBeenCalledWith(
      null,
      { from: null, to: null },
      { teamId: String(general._id) },
    );
  });
});

describe('GET /api/holidays', () => {
  useTestDatabase();

  it('answers 400 without a calendarId', async () => {
    admin();
    const response = await holidaysRoute.GET(
      new Request('http://localhost/api/holidays'),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/calendar/i);
  });

  it('lists one calendar’s holidays', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);

    await holidaysRoute.POST(
      request({
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      }),
    );

    const response = await holidaysRoute.GET(
      new Request(
        `http://localhost/api/holidays?calendarId=${String(india._id)}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1 });
  });
});

describe('the routing table', () => {
  it('gates every S-26 path on config.read', () => {
    for (const path of [
      '/settings/holiday-calendars',
      '/api/holiday-calendars',
      '/api/holiday-calendars/abc',
      '/api/holiday-calendars/abc/teams',
      '/api/holiday-calendars/abc/weekly-off',
      '/api/holiday-calendars/abc/soft-delete',
    ]) {
      expect(requiredPermissionFor(path)).toBe(PERMISSIONS.CONFIG_READ);
    }
  });

  it('leaves the retired team weekly-off path unmapped', () => {
    // The endpoint is gone, and an unmapped path answers 404 rather than
    // falling through as though it were public.
    expect(requiredPermissionFor('/api/teams/abc/weekly-off')).toBeUndefined();
  });
});

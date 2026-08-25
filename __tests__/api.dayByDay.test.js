import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The contract behind the detailed report popup.
 *
 * The popup is a client component, so the ROWS IT SHOWS ARE CHOSEN HERE, on
 * the server, from the viewer's own scope — never from what the request asks
 * for. A handler that trusted a `userIds` parameter would let anyone read the
 * whole company by editing a query string, which is the record half of
 * `FR-1.2` skipped rather than enforced.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const route = await import('../app/api/attendance/day-by-day/route.js');

const {
  createShift,
  createTeam,
  createUser,
  setWeeklyOffPattern,
  updateTeamPolicy,
} = await import('../database.js');

const at = (permission, scope) => ({ [permission]: scope });

const signedInAs = (permissions, extra = {}) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Office Administrator',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
    ...extra,
  });

const get = (url) => new Request(`http://localhost${url}`);

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const RANGE = 'from=2026-08-10&to=2026-08-12';

let codes = 0;

describe('GET /api/attendance/day-by-day', () => {
  useTestDatabase();

  const aTeam = async () => {
    const team = await createTeam({ name: `R${codes++}` }, actor);
    const teamId = String(team._id);

    await createShift(
      {
        teamId,
        name: 'General',
        startTime: '09:00',
        endTime: '18:00',
        timezone: 'Asia/Karachi',
        requiredDailyMinutes: 540,
        graceMinutes: 15,
      },
      actor,
    );
    await setWeeklyOffPattern(teamId, { daysOfWeek: [0, 6] }, null, actor);
    await updateTeamPolicy(teamId, {}, null, actor);

    return teamId;
  };

  const aUser = async (teamId, overrides = {}) =>
    createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `R-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId,
        ...overrides,
      },
      actor,
    );

  describe('the request shape', () => {
    it('requires a date range and says which part is missing', async () => {
      signedInAs(at(PERMISSIONS.ATTENDANCE_READ, SCOPES.ALL));

      const response = await route.GET(get('/api/attendance/day-by-day'));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/from and to/i);
    });

    it('refuses a viewer who does not hold attendance.read', async () => {
      signedInAs({});

      const response = await route.GET(
        get(`/api/attendance/day-by-day?${RANGE}`),
      );

      expect(response.status).toBe(403);
    });

    it('refuses a request with no session at all', async () => {
      getSessionUser.mockResolvedValue(null);

      const response = await route.GET(
        get(`/api/attendance/day-by-day?${RANGE}`),
      );

      expect(response.status).toBe(401);
    });
  });

  describe('the response shape', () => {
    it('answers one block per colleague, each with a row per date', async () => {
      const teamId = await aTeam();
      const user = await aUser(teamId);
      signedInAs(at(PERMISSIONS.ATTENDANCE_READ, SCOPES.ALL));

      const response = await route.GET(
        get(`/api/attendance/day-by-day?${RANGE}&teamId=${teamId}`),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.from).toBe('2026-08-10');
      expect(body.to).toBe('2026-08-12');

      const person = body.people.find(
        (entry) => entry.userId === String(user._id),
      );
      expect(person.fullName).toBe(user.fullName);
      expect(person.days).toHaveLength(3);
      expect(person.days[0]).toMatchObject({
        date: '2026-08-10',
        weekday: expect.any(String),
      });
    });

    it('answers an empty roster rather than an error when nobody matches', async () => {
      signedInAs(at(PERMISSIONS.ATTENDANCE_READ, SCOPES.ALL));

      const response = await route.GET(
        get(`/api/attendance/day-by-day?${RANGE}&teamId=nobody`),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).people).toEqual([]);
    });
  });

  describe('the rows are chosen by scope, never by the query', () => {
    it('gives a SELF-scoped colleague their own days only', async () => {
      const teamId = await aTeam();
      const me = await aUser(teamId);
      const other = await aUser(teamId);

      signedInAs(at(PERMISSIONS.ATTENDANCE_READ, SCOPES.SELF), {
        userId: String(me._id),
        teamId,
      });

      // Asking for somebody else explicitly must not widen the answer.
      const response = await route.GET(
        get(
          `/api/attendance/day-by-day?${RANGE}&userIds=${other._id},${me._id}`,
        ),
      );
      const body = await response.json();

      expect(body.people.map((person) => person.userId)).toEqual([
        String(me._id),
      ]);
    });

    it('pins a TEAM-scoped viewer to their own team, whatever the query names', async () => {
      const mine = await aTeam();
      const theirs = await aTeam();
      const colleague = await aUser(mine);
      const outsider = await aUser(theirs);

      signedInAs(at(PERMISSIONS.ATTENDANCE_READ, SCOPES.TEAM), {
        userId: 'actor-1',
        teamId: mine,
      });

      const response = await route.GET(
        get(`/api/attendance/day-by-day?${RANGE}&teamId=${theirs}`),
      );
      const ids = (await response.json()).people.map((person) => person.userId);

      expect(ids).toContain(String(colleague._id));
      expect(ids).not.toContain(String(outsider._id));
    });

    it('lets an ALL-scoped viewer narrow to the colleagues they name', async () => {
      const teamId = await aTeam();
      const one = await aUser(teamId);
      await aUser(teamId);

      signedInAs(at(PERMISSIONS.ATTENDANCE_READ, SCOPES.ALL));

      const response = await route.GET(
        get(`/api/attendance/day-by-day?${RANGE}&userIds=${one._id}`),
      );

      expect(
        (await response.json()).people.map((person) => person.userId),
      ).toEqual([String(one._id)]);
    });
  });
});

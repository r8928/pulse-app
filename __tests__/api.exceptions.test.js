import { describe, expect, it, vi } from 'vitest';
import {
  EXCEPTION_CODE,
  EXCEPTION_QUEUE,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `S-05`'s contract. `FR-8.1` is the point of the permission tests here:
 * `exceptions.read` is withheld from `EMPLOYEE`, unlike the `S-09` read
 * surface, so the dashboard is the one place a colleague cannot reach.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const exceptionsRoute = await import('../app/api/exceptions/route.js');
const dismissRoute = await import(
  '../app/api/import-exceptions/[id]/dismiss/route.js'
);

const {
  createTeam,
  createUser,
  listImportExceptions,
  recordImportExceptions,
  upsertDayRecord,
} = await import('../database.js');

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

const reader = () => signedInAs(held(PERMISSIONS.EXCEPTIONS_READ));

const importer = () =>
  signedInAs(held(PERMISSIONS.EXCEPTIONS_READ, PERMISSIONS.ATTENDANCE_IMPORT));

const get = (url) => new Request(`http://localhost${url}`);

const post = (url, body) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const params = (id) => ({ params: Promise.resolve({ id }) });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const RANGE = 'from=2026-01-01&to=2026-12-31';

let codes = 0;

describe('the exceptions API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `AE-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId: String(team._id),
      },
      actor,
    );
  };

  const aFlaggedDay = async (userId, date) =>
    upsertDayRecord({
      userId,
      date,
      teamId: 'team-1',
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: {
        dayStatus: 'WFO',
        workedMinutes: 300,
        lateMinutes: 0,
        earlyMinutes: 0,
        deduction: 0,
        deductionRule: null,
        isShortDay: false,
      },
      exceptions: [EXCEPTION_CODE.MISSING_CHECK_OUT],
    });

  describe('GET /api/exceptions', () => {
    it('answers every queue count when no queue is named', async () => {
      const user = await aUser();
      await aFlaggedDay(String(user._id), '2026-08-12');

      reader();
      const response = await exceptionsRoute.GET(
        get(`/api/exceptions?${RANGE}`),
      );

      expect(response.status).toBe(200);
      const { counts } = await response.json();
      expect(Object.keys(counts).sort()).toEqual(
        Object.values(EXCEPTION_QUEUE).sort(),
      );
      expect(counts[EXCEPTION_QUEUE.MISSING_PUNCH]).toBe(1);
    });

    it('answers one queue, paged, when one is named', async () => {
      const user = await aUser();
      await aFlaggedDay(String(user._id), '2026-08-12');
      await aFlaggedDay(String(user._id), '2026-08-13');

      reader();
      const response = await exceptionsRoute.GET(
        get(
          `/api/exceptions?${RANGE}&queue=${EXCEPTION_QUEUE.MISSING_PUNCH}&page=1&pageSize=1`,
        ),
      );

      const body = await response.json();
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(2);
      expect(body.items[0].userName).toBe(user.fullName);
    });

    it('answers an unknown queue as empty rather than failing the page', async () => {
      reader();
      const response = await exceptionsRoute.GET(
        get(`/api/exceptions?${RANGE}&queue=NOT_A_QUEUE`),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: [], total: 0 });
    });

    it('answers 400 without a date range', async () => {
      reader();

      expect((await exceptionsRoute.GET(get('/api/exceptions'))).status).toBe(
        400,
      );
    });

    it('answers 403 without exceptions.read, naming it (FR-8.1)', async () => {
      // The EMPLOYEE case: attendance read at ALL reaches S-09 but never here.
      signedInAs(held(PERMISSIONS.ATTENDANCE_READ));

      const response = await exceptionsRoute.GET(
        get(`/api/exceptions?${RANGE}`),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.EXCEPTIONS_READ,
      );
    });
  });

  describe('POST /api/import-exceptions/[id]/dismiss', () => {
    const aRow = async () => {
      await recordImportExceptions(
        [
          {
            sheetRow: 2,
            employeeCode: 'X-1',
            fullName: 'Unknown',
            reason: 'That code matches no user.',
          },
        ],
        actor,
      );
      const { items } = await listImportExceptions();
      return items[0];
    };

    it('acknowledges the row and takes it out of the queue', async () => {
      const row = await aRow();

      importer();
      const response = await dismissRoute.POST(
        post(`/api/import-exceptions/${row._id}/dismiss`, {
          reason: 'Roster corrected and the sheet re-imported',
        }),
        params(String(row._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).resolved).toBe(true);
      expect((await listImportExceptions()).total).toBe(0);
      // Kept, not purged (NFR-9).
      expect((await listImportExceptions({ resolved: true })).total).toBe(1);
    });

    it('answers 400 with no reason', async () => {
      const row = await aRow();

      importer();
      const response = await dismissRoute.POST(
        post(`/api/import-exceptions/${row._id}/dismiss`, { reason: '' }),
        params(String(row._id)),
      );

      expect(response.status).toBe(400);
    });

    it('answers 403 without attendance.import — reading the queue is not enough', async () => {
      const row = await aRow();

      reader();
      const response = await dismissRoute.POST(
        post(`/api/import-exceptions/${row._id}/dismiss`, { reason: 'x' }),
        params(String(row._id)),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.ATTENDANCE_IMPORT,
      );
    });

    it('answers 404 for a row that is not a record', async () => {
      importer();

      const response = await dismissRoute.POST(
        post('/api/import-exceptions/not-an-id/dismiss', { reason: 'x' }),
        params('not-an-id'),
      );

      expect(response.status).toBe(404);
    });
  });
});

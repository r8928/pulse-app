import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `M-8`'s contracts.
 *
 * `FR-8.1` is what these permission tests are really about, and it splits the
 * two screens: the annual summary is readable for **any** colleague, exactly
 * as everyone could read everyone's in the old workbook — while the report
 * builder and the export beside it stay restricted.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const reportsRoute = await import('../app/api/reports/route.js');
const annualRoute = await import('../app/api/reports/annual/route.js');
const exportRoute = await import('../app/api/reports/export/route.js');

const { createShift, createTeam, createUser } = await import('../database.js');
const { giveTeamACalendar } = await import('../test/calendar.js');

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

const builder = () =>
  signedInAs(held(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.REPORT_BUILD));

/** The EMPLOYEE case: FR-8.1's read surface and nothing more. */
const colleague = () => signedInAs(held(PERMISSIONS.ATTENDANCE_READ));

const get = (url) => new Request(`http://localhost${url}`);

const post = (url, body) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const RANGE = 'from=2026-08-10&to=2026-08-16';

let codes = 0;

describe('the reports API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes++}` }, actor);
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
    await giveTeamACalendar(teamId, { daysOfWeek: [0, 6] }, actor);

    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `RA-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId,
      },
      actor,
    );
  };

  describe('GET /api/reports', () => {
    it('answers a row per colleague with the calendar counts beside the totals', async () => {
      const user = await aUser();

      builder();
      const response = await reportsRoute.GET(get(`/api/reports?${RANGE}`));

      expect(response.status).toBe(200);
      const body = await response.json();
      const row = body.rows.find(
        (candidate) => candidate.userId === String(user._id),
      );
      expect(row.workingDays).toBe(5);
      expect(row.present).toBe(0);
    });

    it('answers 400 without a date range', async () => {
      builder();

      expect((await reportsRoute.GET(get('/api/reports'))).status).toBe(400);
    });

    it('answers 403 to a colleague holding only attendance.read (FR-8.1)', async () => {
      colleague();

      const response = await reportsRoute.GET(get(`/api/reports?${RANGE}`));

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.REPORT_BUILD);
    });
  });

  describe('GET /api/reports/annual', () => {
    it('is readable by any colleague, unlike the builder beside it (FR-8.1)', async () => {
      const user = await aUser();

      colleague();
      const response = await annualRoute.GET(
        get(`/api/reports/annual?userId=${user._id}&year=2026`),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.months).toHaveLength(12);
    });

    it('answers 400 without a colleague and a year', async () => {
      colleague();

      expect(
        (await annualRoute.GET(get('/api/reports/annual?year=2026'))).status,
      ).toBe(400);
    });

    it('answers 404 for a colleague who does not exist', async () => {
      colleague();

      const response = await annualRoute.GET(
        get('/api/reports/annual?userId=60b8d295f1e2a40000000000&year=2026'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/reports/export', () => {
    const payload = {
      columns: [
        { key: 'fullName', label: 'Employee' },
        { key: 'present', label: 'Present' },
      ],
      rows: [{ fullName: 'Aisha Khan', present: 21 }],
    };

    it('returns a CSV attachment of exactly the rows it was given (FR-8.5)', async () => {
      builder();

      const response = await exportRoute.POST(
        post('/api/reports/export', { ...payload, format: 'csv' }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain(
        'attachment',
      );
      const body = await response.text();
      expect(body).toContain('Employee,Present');
      expect(body).toContain('Aisha Khan,21');
    });

    it('returns a workbook for xlsx', async () => {
      builder();

      const response = await exportRoute.POST(
        post('/api/reports/export', { ...payload, format: 'xlsx' }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('spreadsheetml');
    });

    it('answers 400 for a format it does not produce', async () => {
      builder();

      const response = await exportRoute.POST(
        post('/api/reports/export', { ...payload, format: 'pdf' }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('pdf');
    });

    it('answers 400 with no columns to export', async () => {
      builder();

      const response = await exportRoute.POST(
        post('/api/reports/export', { columns: [], rows: [] }),
      );

      expect(response.status).toBe(400);
    });

    it('answers 403 to a colleague holding only attendance.read', async () => {
      colleague();

      const response = await exportRoute.POST(
        post('/api/reports/export', payload),
      );

      expect(response.status).toBe(403);
    });
  });
});

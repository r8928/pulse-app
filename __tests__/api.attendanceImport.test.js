import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * S-11's two steps, asserted from the handler side.
 *
 * FR-4.11: the date format is confirmed BEFORE validation runs, so the
 * validate endpoint refuses to guess one. FR-4.4: the preview writes nothing.
 * FR-4.5: the commit writes everything or nothing.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const validateRoute = await import(
  '../app/api/attendance/import/validate/route.js'
);
const commitRoute = await import(
  '../app/api/attendance/import/commit/route.js'
);

const {
  createShift,
  createTeam,
  createUser,
  getDayRecord,
  listImportExceptions,
  updateTeamPolicy,
} = await import('../database.js');
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

const importer = () =>
  signedInAs(held(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_IMPORT));

const readerOnly = () => signedInAs(held(PERMISSIONS.ATTENDANCE_READ));

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

/** A workbook in the FR-4.3 format, as the biometric terminal exports it. */
async function sheetOf(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Attendance');

  sheet.addRow([
    'Sr No.',
    'Employee Code',
    'Employee Name',
    'Type',
    'Date',
    'Time',
  ]);

  rows.forEach((row, index) => {
    sheet.addRow([
      index + 1,
      row.employeeCode,
      row.fullName,
      row.type,
      row.date,
      row.time,
    ]);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const upload = async (rows, dateFormat) => {
  const form = new FormData();
  form.append(
    'file',
    new Blob([await sheetOf(rows)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'attendance.xlsx',
  );
  if (dateFormat) form.append('dateFormat', dateFormat);

  return new Request('http://localhost/api/attendance/import/validate', {
    method: 'POST',
    body: form,
  });
};

const json = (body) =>
  new Request('http://localhost/api/attendance/import/commit', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('the attendance import API', () => {
  useTestDatabase();

  const aTrackedUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      {
        automaticDeductionLeaveType: 'Casual',
        leaveDeductionLadder: [],
        shortDayThresholdPercent: 89,
        midnightCrossingWindowHours: 8,
        duplicatePunchWindowMinutes: 10,
      },
      null,
      actor,
    );
    await giveTeamACalendar(String(team._id), { daysOfWeek: [0, 6] }, actor);

    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Days',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );

    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `M-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );
  };

  const goodRows = (user) => [
    {
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      type: 'Check In',
      date: '12/08/2026',
      time: '09:00',
    },
    {
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      type: 'Check Out',
      date: '12/08/2026',
      time: '18:00',
    },
  ];

  describe('POST /api/attendance/import/validate', () => {
    it('previews accepted rows without writing anything (FR-4.4)', async () => {
      const user = await aTrackedUser();
      importer();

      const response = await validateRoute.POST(
        await upload(goodRows(user), 'DMY'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.accepted).toHaveLength(2);
      expect(body.rejected).toEqual([]);

      // Nothing committed: the day has no record yet.
      expect(await getDayRecord(String(user._id), '2026-08-12')).toBeNull();
    });

    it('refuses to run before a date format is confirmed (FR-4.11)', async () => {
      const user = await aTrackedUser();
      importer();

      const response = await validateRoute.POST(await upload(goodRows(user)));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/date format/i);
    });

    it('states a reason against every rejected row', async () => {
      importer();

      const response = await validateRoute.POST(
        await upload(
          [
            {
              employeeCode: 'NOT-A-CODE',
              fullName: 'Nobody',
              type: 'Check In',
              date: '12/08/2026',
              time: '09:00',
            },
          ],
          'DMY',
        ),
      );

      const body = await response.json();
      expect(body.accepted).toEqual([]);
      expect(body.rejected[0].reason).toMatch(/matches no user/i);
      expect(body.rejected[0].sheetRow).toBe(2);
    });

    it('answers 403 without attendance.import, naming it', async () => {
      const user = await aTrackedUser();
      readerOnly();

      const response = await validateRoute.POST(
        await upload(goodRows(user), 'DMY'),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.ATTENDANCE_IMPORT,
      );
    });

    it('answers 400 when no file was offered', async () => {
      importer();

      const form = new FormData();
      form.append('dateFormat', 'DMY');

      const response = await validateRoute.POST(
        new Request('http://localhost/api/attendance/import/validate', {
          method: 'POST',
          body: form,
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/attendance/import/commit', () => {
    it('writes the rows and recalculates the days they touched', async () => {
      const user = await aTrackedUser();
      const userId = String(user._id);
      importer();

      const preview = await (
        await validateRoute.POST(await upload(goodRows(user), 'DMY'))
      ).json();

      const response = await commitRoute.POST(json({ rows: preview.accepted }));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.inserted).toBe(2);

      const record = await getDayRecord(userId, '2026-08-12');
      expect(record.computed.workedMinutes).toBe(540);
    });

    it('queues the rejected rows for S-05, so a bad row outlives the tab (D-26)', async () => {
      const user = await aTrackedUser();
      importer();

      const preview = await (
        await validateRoute.POST(
          await upload(
            [
              ...goodRows(user),
              {
                employeeCode: 'NOBODY-1',
                fullName: 'Not On The Roster',
                type: 'IN',
                date: '12/08/2026',
                time: '09:00',
              },
            ],
            'DMY',
          ),
        )
      ).json();

      expect(preview.rejected).toHaveLength(1);

      await commitRoute.POST(
        json({ rows: preview.accepted, rejected: preview.rejected }),
      );

      const { items, total } = await listImportExceptions();
      expect(total).toBe(1);
      expect(items[0].employeeCode).toBe('NOBODY-1');
      expect(items[0].reason).toBeTruthy();
    });

    it('queues nothing for a preview nobody committed', async () => {
      const user = await aTrackedUser();
      importer();

      await validateRoute.POST(
        await upload(
          [
            {
              employeeCode: 'NOBODY-2',
              fullName: 'Not On The Roster',
              type: 'IN',
              date: '12/08/2026',
              time: '09:00',
            },
            ...goodRows(user),
          ],
          'DMY',
        ),
      );

      // Validation alone asserted nothing about the file, so nothing queues.
      expect((await listImportExceptions()).total).toBe(0);
    });

    it('answers 403 without attendance.import', async () => {
      readerOnly();

      expect((await commitRoute.POST(json({ rows: [] }))).status).toBe(403);
    });

    it('answers 400 when the body carries no rows', async () => {
      importer();

      expect((await commitRoute.POST(json({}))).status).toBe(400);
    });
  });
});

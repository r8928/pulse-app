import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import {
  ATTENDANCE_SHEET_COLUMNS,
  ATTENDANCE_SHEET_NAME,
} from '../utils/attendanceImport.js';

/**
 * The blank punch template `S-11` hands out.
 *
 * Its whole value is that the headings are right, so the contract asserted
 * here is the headings — read back out of the workbook the route produced,
 * against the same constants the parser matches on. A template that drifts
 * from the parser is worse than none, because it looks authoritative.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const templateRoute = await import(
  '../app/api/attendance/import/template/route.js'
);

const signedInAs = (permissions) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Ahmar Ali',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
  });

const importer = () =>
  signedInAs({ [PERMISSIONS.ATTENDANCE_IMPORT]: SCOPES.ALL });
const readerOnly = () =>
  signedInAs({ [PERMISSIONS.ATTENDANCE_READ]: SCOPES.ALL });

const request = () =>
  new Request('http://localhost/api/attendance/import/template');

const workbookFrom = async (response) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
};

describe('GET /api/attendance/import/template', () => {
  it('answers a workbook, offered as a download', async () => {
    importer();

    const response = await templateRoute.GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/spreadsheetml/);
    expect(response.headers.get('content-disposition')).toMatch(/attachment/);
    expect(response.headers.get('content-disposition')).toMatch(/\.xlsx/);
  });

  it('heads the sheet with exactly the columns the parser reads', async () => {
    importer();

    const workbook = await workbookFrom(await templateRoute.GET(request()));
    const sheet = workbook.getWorksheet(ATTENDANCE_SHEET_NAME);
    const headings = sheet.getRow(1).values.slice(1);

    expect(headings).toEqual(
      ATTENDANCE_SHEET_COLUMNS.map((column) => column.name),
    );
  });

  it('names the sheet the one the upload looks for', async () => {
    importer();

    const workbook = await workbookFrom(await templateRoute.GET(request()));

    expect(workbook.getWorksheet(ATTENDANCE_SHEET_NAME)).toBeDefined();
  });

  it('carries no rows, so nobody imports the example by accident', async () => {
    importer();

    const workbook = await workbookFrom(await templateRoute.GET(request()));
    const sheet = workbook.getWorksheet(ATTENDANCE_SHEET_NAME);

    expect(sheet.actualRowCount).toBe(1);
  });

  it('answers 403 without attendance.import', async () => {
    readerOnly();

    expect((await templateRoute.GET(request())).status).toBe(403);
  });
});

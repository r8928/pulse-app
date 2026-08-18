import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';
import {
  SHEET_COLUMNS,
  SHEET_NAME,
} from '../../../../../utils/rosterImport.js';

/**
 * The blank sheet `S-08` hands out, so the headings are right before anybody
 * types a row.
 *
 * Generated rather than committed as a fixture: a checked-in workbook is a
 * second copy of the column list, and the copy that goes stale is the one
 * people are told to trust. Built from `SHEET_COLUMNS`, it cannot disagree
 * with the parser that reads it back.
 *
 * Empty on purpose. Example rows in a template get imported by somebody in a
 * hurry, and `S-08` shows the worked example on screen instead.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);

    sheet.columns = SHEET_COLUMNS.map((column) => ({
      header: column.name,
      // Wide enough that a heading is readable without being dragged out.
      // A truncated heading is what makes somebody retype it wrongly.
      width: Math.max(column.name.length, column.example.length) + 6,
    }));

    sheet.getRow(1).font = { bold: true };

    return new NextResponse(await workbook.xlsx.writeBuffer(), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="pulse-roster-template.xlsx"',
        // The columns change with the code, so a cached copy would be the one
        // thing worse than no template: confidently wrong.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

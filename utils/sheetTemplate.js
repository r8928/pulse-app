import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';

/**
 * The blank workbook an import screen hands out, so the headings are right
 * before anybody types a row.
 *
 * Generated rather than committed as a fixture: a checked-in workbook is a
 * second copy of the column list, and the copy that goes stale is the one
 * people are told to trust. Every template is built from the same
 * `SHEET_COLUMNS` list its parser matches on, so the two cannot disagree.
 *
 * Empty on purpose. Example rows in a template get imported by somebody in a
 * hurry, so the worked example lives on screen in the format guide instead.
 *
 * Shared by `S-08` and `S-11`, which hand out differently shaped sheets the
 * same way.
 *
 * @param {{ sheetName: string, columns: ReadonlyArray<{name: string, example: string}>, filename: string }} shape
 * @returns {Promise<NextResponse>} the workbook, offered as a download
 */
export async function sheetTemplateResponse({ sheetName, columns, filename }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
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
      'Content-Disposition': `attachment; filename="${filename}"`,
      // The columns change with the code, so a cached copy would be the one
      // thing worse than no template: confidently wrong.
      'Cache-Control': 'no-store',
    },
  });
}

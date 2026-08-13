import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import {
  commitRosterImport,
  getAllEmployeeCodes,
} from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';
import { validateRosterRows } from '../../../../utils/rosterImport.js';

/**
 * S-08. The one-time go-live migration of the roster from the old workbook's
 * `Biometric ID` sheet (`FR-2.9`).
 *
 * Two endpoints in one route, because they are two steps of one job:
 *
 *   POST multipart  → parse and validate, commit nothing
 *   POST json       → commit the completed rows, atomically
 *
 * It imports **people, not attendance**. Historical attendance is deliberately
 * not migrated (`FR-6.13`), so nothing here touches a punch or a day record.
 */

/** The sheet carries a code and a name. Nothing else is read from it. */
async function readSheet(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet =
    workbook.getWorksheet('Biometric ID') ?? workbook.worksheets.at(0);

  if (!sheet) {
    throw new Error('That file has no readable sheet in it.');
  }

  const [header, ...body] = sheet.getSheetValues().filter(Boolean);
  const columns = (header ?? []).map((cell) =>
    cell === null || cell === undefined ? '' : String(cell).trim(),
  );

  return body.map((row) =>
    Object.fromEntries(
      columns.map((name, index) => [name, row?.[index] ?? null]),
    ),
  );
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const contentType = request.headers.get('content-type') ?? '';

    // Step 3: commit. Every accepted row is written or none is (`FR-4.5`'s
    // guarantee, applied to the roster).
    if (contentType.includes('application/json')) {
      const { rows } = await request.json();
      return NextResponse.json(await commitRosterImport(rows, actor));
    }

    // Steps 1 and 2: parse and validate. Nothing is committed here, so an
    // administrator can correct the file and re-upload without leaving the
    // browser.
    const form = await request.formData();
    const file = form.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json(
        { error: 'Choose the Biometric ID sheet to upload.' },
        { status: 400 },
      );
    }

    let parsed;
    try {
      parsed = await readSheet(file);
    } catch (caught) {
      return NextResponse.json(
        {
          error: `That file could not be read as a workbook. ${caught.message}`,
        },
        { status: 400 },
      );
    }

    const codes = new Set(await getAllEmployeeCodes());

    return NextResponse.json(validateRosterRows(parsed, codes));
  } catch (error) {
    return errorResponse(error);
  }
}

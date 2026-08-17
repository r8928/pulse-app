import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { loadImportContext } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';
import {
  DATE_FORMATS,
  validateAttendanceRows,
} from '../../../../../utils/attendanceImport.js';
import { readSheetRows } from '../../../../../utils/sheet.js';

/**
 * S-11 steps 1 to 3. FR-4.4: a preview of accepted rows against rejected ones,
 * each rejection carrying its stated reason — and **nothing is committed**.
 *
 * FR-4.11: the date format is confirmed by a person before this runs. It is a
 * required field rather than something inferred from the data, because
 * `03/04/2026` is a different day under two formats and a wrong guess would be
 * indistinguishable from a right one.
 */

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const form = await request.formData();
    const file = form.get('file');
    const dateFormat = form.get('dateFormat');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'Choose a file to import.' },
        { status: 400 },
      );
    }

    if (!dateFormat || !DATE_FORMATS[dateFormat]) {
      return NextResponse.json(
        {
          error:
            'Confirm the date format the sheet uses before validating it. 03/04/2026 is a different day under each, and the system will not guess.',
        },
        { status: 400 },
      );
    }

    const rows = await readSheetRows(file);

    // NFR-4: one bulk load of every code in the sheet, not one query per row.
    const codes = [
      ...new Set(
        rows
          .map((row) => String(row['Employee Code'] ?? '').trim())
          .filter(Boolean),
      ),
    ];

    const { usersByCode } = await loadImportContext({ codes });

    return NextResponse.json(
      validateAttendanceRows(rows, { usersByCode, dateFormat }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

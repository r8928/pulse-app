import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';
import {
  ATTENDANCE_SHEET_COLUMNS,
  ATTENDANCE_SHEET_NAME,
} from '../../../../../utils/attendanceImport.js';
import { sheetTemplateResponse } from '../../../../../utils/sheetTemplate.js';

/**
 * The blank punch sheet `S-11` hands out, for the case the terminal's own
 * export has to be retyped or a month has to be entered by hand.
 *
 * It carries no dates. `FR-4.11` has a person confirm which format the sheet
 * uses at step 2, and a template that pre-committed to one would be answering
 * that question on their behalf.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    return await sheetTemplateResponse({
      sheetName: ATTENDANCE_SHEET_NAME,
      columns: ATTENDANCE_SHEET_COLUMNS,
      filename: 'pulse-attendance-template.xlsx',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

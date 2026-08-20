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
import { sheetTemplateResponse } from '../../../../../utils/sheetTemplate.js';

/**
 * The blank roster sheet `S-08` hands out. `sheetTemplate.js` explains why it
 * is generated from `SHEET_COLUMNS` rather than committed as a fixture.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    return await sheetTemplateResponse({
      sheetName: SHEET_NAME,
      columns: SHEET_COLUMNS,
      filename: 'pulse-roster-template.xlsx',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

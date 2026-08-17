import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { resolveImportException } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * `D-26`. There is nothing to approve or decline about a row nobody could
 * match — only to acknowledge, once the sheet or the roster is fixed and
 * re-imported. Marked rather than deleted (`NFR-9`), and audited.
 *
 * `attendance.import` rather than `exceptions.read`: dismissing is a statement
 * about an import, and the permission that governs imports should govern it.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { reason } = await request.json();
    const after = await resolveImportException(id, reason, actor);

    return after
      ? NextResponse.json(after)
      : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

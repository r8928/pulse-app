import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteShift } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-30's removal. Refused while the shift is a team's default: a user holding
 * no shift of their own takes that default, and `DC-6` leaves nothing to fall
 * back to (`FR-3.4`).
 *
 * Soft delete only, so historical day records still resolve the shift they
 * were computed under.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const deleted = await softDeleteShift(id, body, version, actor);

    if (!deleted) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(deleted);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteTeam } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-29. Refused while any serving user is still assigned, naming them so they
 * are **moved** first (`FR-3.2`).
 *
 * The team is never destroyed: it stays readable so past day records still
 * resolve through the calendar, pattern and policy it held, and is simply no
 * longer offered for assignment.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.TEAM_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const deleted = await softDeleteTeam(id, body, version, actor);

    if (!deleted) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(deleted);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteAuthorisedDomain } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-41's removal. Soft delete, so the audit trail still resolves which domain
 * was authorised when a past sign-in was allowed or refused (FR-1.6).
 *
 * The database refuses to remove the last one — an empty list locks everybody
 * out with no signed-in surface left to undo it from.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const removed = await softDeleteAuthorisedDomain(id, body, version, actor);

    if (!removed) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(removed);
  } catch (error) {
    return errorResponse(error);
  }
}

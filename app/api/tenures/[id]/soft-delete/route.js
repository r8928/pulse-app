import { NextResponse } from 'next/server';
import { assertPermission, requireActor } from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteTenure } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-18. Refused when it is the user's last tenure that is not soft deleted:
 * `FR-2.12` says every user always keeps at least one.
 *
 * Where the reduced employment period leaves records stranded, `FR-2.11`
 * raises an approval before they are soft deleted. That workflow is Phase 6,
 * and nothing can be stranded yet — no punch, day record or ledger entry
 * exists.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    assertPermission(actor, PERMISSIONS.USER_WRITE);

    const { version, ...body } = await request.json();
    const removed = await softDeleteTenure(id, body, version, actor);

    if (!removed) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(removed);
  } catch (error) {
    return errorResponse(error);
  }
}

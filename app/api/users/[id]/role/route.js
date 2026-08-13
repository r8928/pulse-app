import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { changeUserRole, getUserById } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-10. FR-1.7: a user holds exactly one role, and naming them MANAGER names
 * the team, replacing that team's previous manager in the same action so
 * FR-3.1 holds before and after.
 *
 * The change takes effect on the next request, because nothing caches the
 * role — `session.js` re-reads it every time.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_WRITE);

    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(existing._id),
      teamId: existing.teamId,
    });

    const { version, ...body } = await request.json();

    return NextResponse.json(await changeUserRole(id, body, version, actor));
  } catch (error) {
    return errorResponse(error);
  }
}

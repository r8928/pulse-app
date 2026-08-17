import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  acknowledgeDuplicatePunch,
  getPunchById,
  getUserById,
} from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * `P-07`'s "keep". The other half — "soft delete" — is the punch soft-delete
 * route that already exists, because removing a duplicate is removing a punch
 * and there is no second way to do that (`FR-4.12`).
 *
 * `attendance.write`: this is a decision about a punch, and that is the
 * permission governing punches everywhere else.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_WRITE);

    const punch = await getPunchById(id);
    if (!punch) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const user = await getUserById(punch.userId);
    assertRecordInScope(scope, actor, {
      userId: punch.userId,
      teamId: user?.teamId ?? null,
    });

    const { reason } = await request.json();
    const after = await acknowledgeDuplicatePunch(id, reason, actor);

    return after
      ? NextResponse.json(after)
      : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

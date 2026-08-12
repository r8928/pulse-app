import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { getUserById, restoreUser } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-16. The caller must state which case applies, because the two behave
 * differently and the difference is not recoverable afterwards:
 *
 *   CORRECTION  the soft delete was a mistake — the most recent tenure
 *               reopens, leaving no gap in the employment period
 *   REHIRE      a new tenure opens from a supplied start date, the gap stays
 *               outside the period, and entitlement prorates from that start
 *
 * Both clear deletedAt and the date of leaving.
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
    const user = await restoreUser(id, body, actor, version);

    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

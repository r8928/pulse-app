import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import {
  PERMISSIONS,
  REDUCTION_CHANGE,
} from '../../../../../constants/index.js';
import { getUserById, softDeleteUser } from '../../../../../database.js';
import { checkReduction } from '../../../../../engine/reduction.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-15. Requires a date of leaving, which closes the user's open tenure, and a
 * reason, which is mandatory on every soft delete (FR-4.10).
 *
 * This is a soft delete and the only kind available: no endpoint anywhere
 * physically deletes a user (FR-2.2, MVP criterion 14). Access is revoked
 * immediately — it never waits for the FR-2.11 approval of records left
 * outside the reduced employment period.
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
    const user = await softDeleteUser(id, body, actor, version);

    // FR-2.11, and deliberately AFTER the soft delete rather than before it:
    // the departure and the loss of access are already in force by now. Only
    // the fate of any records left outside the reduced period waits for
    // OFFICE_ADMIN, and this is what queues that question on S-05.
    await checkReduction(
      id,
      { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
      actor,
    );

    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  createTenure,
  getUserById,
  listShiftAssignments,
  listTeamAssignments,
} from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-17. FR-2.12: employment is one or more tenures, each an unbroken period.
 * Two of the same user may not overlap, and the gap between them is precisely
 * what says they were not employed then.
 *
 * The GET also answers the S-07 assignment tabs, because all three lists
 * belong to the same user and one round trip is enough.
 */
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_READ);

    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(existing._id),
      teamId: existing.teamId,
    });

    const [shiftAssignments, teamAssignments] = await Promise.all([
      listShiftAssignments(id),
      listTeamAssignments(id),
    ]);

    return NextResponse.json({
      tenures: existing.tenures,
      shiftAssignments,
      teamAssignments,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

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

    const created = await createTenure(id, await request.json(), actor);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

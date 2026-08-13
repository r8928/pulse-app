import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { getUserById, moveUserTeam } from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-11. FR-3.14: an edit of the user's assignment, recorded with an effective
 * date so the team they held on a past date is the one the engine resolves for
 * that date. A move never rewrites history.
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
    const updated = await moveUserTeam(id, body, version, actor);

    // FR-3.14: from the effective date forward only — never backwards.
    await recalculateDays(id, { from: body.effectiveFrom, to: null });

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { assignUserShift, getUserById } from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-12. FR-3.6: an effective date range, so a mid-year shift change is
 * preserved historically rather than overwriting the past.
 *
 * Required for a tracked user and optional for an untracked one (`FR-3.4`).
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
    const updated = await assignUserShift(id, body, version, actor);

    // The shift supplies the start, required duration and grace every day
    // under it was judged by, so the covered range is recomputed.
    await recalculateDays(id, {
      from: body.effectiveFrom,
      to: body.effectiveTo ?? null,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

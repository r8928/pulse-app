import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { updateShift } from '../../../../database.js';
import { recalculateDays } from '../../../../engine/recalculate.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * P-30's edit. A shift's start, end, required duration and grace decide how
 * every day under it was judged, so a change recalculates them — leaving any
 * override a person put there standing (`FR-6.12`).
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const updated = await updateShift(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await recalculateDays(
      null,
      { from: null, to: null },
      { teamId: updated.teamId },
    );

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

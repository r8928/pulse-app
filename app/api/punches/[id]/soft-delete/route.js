import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  getPunchById,
  getUserById,
  softDeletePunch,
} from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';
import { recalculationWindowFor } from '../../../../../utils/recalculationWindow.js';

/**
 * P-22. A punch that should not be there is soft deleted, never removed
 * (NFR-9, I-1): the row survives so the correction itself stays visible in the
 * record's history, and the day it was on is recalculated without it.
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

    const owner = await getUserById(punch.userId);
    assertRecordInScope(scope, actor, {
      userId: String(punch.userId),
      teamId: owner?.teamId ?? null,
    });

    const { version, reason } = await request.json();
    const deleted = await softDeletePunch(id, reason, version, actor);

    await recalculateDays(
      String(punch.userId),
      recalculationWindowFor([punch.at]),
      { actor, reason },
    );

    return NextResponse.json(deleted);
  } catch (error) {
    return errorResponse(error);
  }
}

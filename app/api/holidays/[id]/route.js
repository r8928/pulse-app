import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { updateHoliday } from '../../../../database.js';
import { recalculateDays } from '../../../../engine/recalculate.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/** P-31's edit. `BR-15`: a mid-year correction recalculates the affected dates. */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const updated = await updateHoliday(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Both dates matter: the one the holiday left and the one it moved to.
    await recalculateDays(
      null,
      { from: patch.date ?? updated.date, to: updated.date },
      { teamId: updated.teamId },
    );

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

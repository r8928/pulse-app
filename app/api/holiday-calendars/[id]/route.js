import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { updateHolidayCalendar } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * `S-26`'s rename. No recalculation: a calendar's name is not a date, and
 * nothing the engine reads changes with it.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const updated = await updateHolidayCalendar(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

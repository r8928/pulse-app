import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteHolidayCalendar } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * `S-26`'s removal, refused while any team is still assigned (`D-30`). The
 * `ValidationError` naming those teams becomes a 400 through `errorResponse`
 * with no special handling here.
 *
 * No recalculation: a calendar reaching this point serves no team, so no day
 * record was classified against it.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const removed = await softDeleteHolidayCalendar(id, body, version, actor);

    if (!removed) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(removed);
  } catch (error) {
    return errorResponse(error);
  }
}

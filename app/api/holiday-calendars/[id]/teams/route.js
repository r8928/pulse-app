import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  getHolidayCalendarById,
  setCalendarTeams,
} from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * `D-31`. The full list of teams this calendar serves, reconciled in one
 * write. A team already on another calendar is moved: a team holds at most one
 * calendar, and `teams.calendarId` being single-valued makes that unbreakable
 * rather than merely enforced.
 *
 * Both sides recalculate. A team leaving loses the holidays and the weekly off
 * it was classified against, so the day type of every one of its dates changes
 * exactly as much as a joining team's does.
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const calendar = await getHolidayCalendarById(id);
    if (!calendar) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const { teamIds } = await request.json();
    const { joined, left } = await setCalendarTeams(id, teamIds, actor);

    for (const teamId of [...joined, ...left]) {
      await recalculateDays(null, { from: null, to: null }, { teamId });
    }

    return NextResponse.json({ joined, left });
  } catch (error) {
    return errorResponse(error);
  }
}

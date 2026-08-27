import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createHolidayCalendar,
  listHolidayCalendars,
  listTeamsOnCalendar,
} from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * `S-26`, `FR-3.7`. Calendars are company-wide records that teams are assigned
 * to, shared across teams, and never created automatically when a team is.
 *
 * Each item carries the teams currently assigned, because the screen's whole
 * job is deciding which calendar a team belongs on — a list that did not say
 * would need a second request per calendar before it was usable.
 */
export async function GET(_request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { items, total } = await listHolidayCalendars();

    const withTeams = await Promise.all(
      items.map(async (calendar) => ({
        ...calendar,
        teams: (await listTeamsOnCalendar(String(calendar._id))).map(
          (team) => ({ _id: String(team._id), name: team.name }),
        ),
      })),
    );

    return NextResponse.json({ items: withTeams, total });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const created = await createHolidayCalendar(await request.json(), actor);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

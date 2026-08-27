import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createHoliday,
  listCalendarHolidays,
  listTeamsOnCalendar,
} from '../../../database.js';
import { recalculateDays } from '../../../engine/recalculate.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * P-31. A calendar is a company-wide record shared by every team assigned to
 * it, so two teams on different calendars observe different holidays on the
 * same date (`FR-3.7`).
 *
 * The type is a stored value, not a visual convention: a calendar shall never
 * depend on formatting or colour, which has to be true of the data as well as
 * the screen.
 *
 * `BR-15`: a mid-year calendar edit is legitimate and recalculates the dates
 * it touches, for EVERY team on the calendar — the widest fan-out in the
 * system, and wider than it was when a calendar belonged to one team.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);
    const calendarId = url.searchParams.get('calendarId');

    if (!calendarId) {
      return NextResponse.json(
        {
          error:
            'A calendar is required — holidays belong to a calendar, not a team.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await listCalendarHolidays(calendarId, {
        includeDeleted: url.searchParams.get('includeDeleted') === 'true',
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const created = await createHoliday(await request.json(), actor);

    for (const team of await listTeamsOnCalendar(created.calendarId)) {
      await recalculateDays(
        null,
        { from: created.date, to: created.date },
        { teamId: String(team._id) },
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

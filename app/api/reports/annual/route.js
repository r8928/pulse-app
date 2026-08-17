import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getUserById } from '../../../../database.js';
import { buildAnnualSummary } from '../../../../engine/reports.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * `S-21`, `FR-8.4`. One colleague's year, every month present.
 *
 * `attendance.read`, seeded at `ALL` per `FR-8.1` — readable for any
 * colleague, exactly as everyone could read everyone's in the old workbook.
 * That is the difference between this and `S-20` beside it, which needs
 * `report.build`.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_READ);

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const year = Number(url.searchParams.get('year'));

    if (!userId || !Number.isInteger(year)) {
      return NextResponse.json(
        { error: 'A colleague and a year are required.' },
        { status: 400 },
      );
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(user._id),
      teamId: user.teamId,
    });

    return NextResponse.json(await buildAnnualSummary(userId, year));
  } catch (error) {
    return errorResponse(error);
  }
}

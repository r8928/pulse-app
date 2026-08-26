import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  getUserById,
  listDayRecords,
  listTrackedUserIds,
} from '../../../database.js';
import { recalculateDays } from '../../../engine/recalculate.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * The read surface behind the attendance summary.
 *
 * `materialise=true` is the D-15 touch: a day record is created the first time
 * something touches the date. No screen passes it any more — the daily grid
 * that did is gone — so day records now arise from the punch import, from
 * recording leave, and from a caller asking for this flag explicitly. It stays
 * bounded to one team and one date deliberately (D-2, D-18): nothing in the
 * system proactively backfills.
 *
 * Because it writes, it asserts `attendance.write` rather than the read
 * permission the rest of this handler needs.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_READ);

    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: 'A date range is required — from and to.' },
        { status: 400 },
      );
    }

    const teamId = url.searchParams.get('teamId');
    const userId = url.searchParams.get('userId');

    if (userId) {
      const user = await getUserById(userId);
      if (!user) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      }
      assertRecordInScope(scope, actor, {
        userId: String(user._id),
        teamId: user.teamId,
      });
    }

    // FR-2.10: untracked users receive no day records, so the list of ids a
    // grid is drawn from is the tracked roster, never the whole one.
    const userIds = userId
      ? [userId]
      : teamId
        ? await listTrackedUserIds({ teamId })
        : null;

    if (url.searchParams.get('materialise') === 'true') {
      assertPermission(actor, PERMISSIONS.ATTENDANCE_WRITE);

      await recalculateDays(
        userId ?? null,
        { from, to },
        {
          teamId,
          materialiseUsers: userIds ?? (await listTrackedUserIds()),
          actor,
          reason: 'Attendance opened for this team and date',
        },
      );
    }

    const items = await listDayRecords({ userIds, from, to });

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return errorResponse(error);
  }
}

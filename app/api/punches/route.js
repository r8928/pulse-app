import { format } from 'date-fns';
import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createPunch,
  getUserById,
  listPunchesForWorkDate,
} from '../../../database.js';
import { recalculateDays } from '../../../engine/recalculate.js';
import { errorResponse } from '../../../utils/apiResponse.js';
import { recalculationWindowFor } from '../../../utils/recalculationWindow.js';

/**
 * P-21. FR-4.1: a punch is a time, a direction, and the user it belongs to.
 *
 * The work date is deliberately not accepted from the caller — §13 resolves it
 * against the shift held on the day, and a client that guessed it would put
 * a night-shift check-out on the wrong day record.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_READ);

    const url = new URL(request.url);
    const workDate = url.searchParams.get('workDate');

    if (!workDate) {
      return NextResponse.json(
        { error: 'A work date is required.' },
        { status: 400 },
      );
    }

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

    const items = await listPunchesForWorkDate(workDate, {
      userIds: userId ? [userId] : null,
    });

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_WRITE);

    const body = await request.json();

    const owner = await getUserById(body.userId);
    if (!owner) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(owner._id),
      teamId: owner.teamId,
    });

    const punch = await createPunch(body, actor);
    if (!punch) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await recalculateDays(
      String(punch.userId),
      recalculationWindowFor([punch.at]),
      {
        actor,
        reason: `Punch recorded at ${format(punch.at, 'yyyy-MM-dd HH:mm')}`,
      },
    );

    return NextResponse.json(punch, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

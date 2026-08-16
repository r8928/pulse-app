import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createLeaveRecord,
  getLeaveRecordsForUserDates,
  getUserById,
} from '../../../database.js';
import { recalculateDays } from '../../../engine/recalculate.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * P-26. D-9: a leave record is a genuine engine INPUT, read the way a punch is
 * — not an override of what the engine concluded. Recording one and
 * recalculating the date is what produces the LEAVE status and its
 * LEAVE_AVAILED movement; nothing here writes either directly.
 *
 * D-10: one date at a time. A range convenience would call this once per date
 * and needs no change to the shape.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.LEAVE_READ);

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const date = url.searchParams.get('date');

    if (!userId || !date) {
      return NextResponse.json(
        { error: 'A user and a date are required.' },
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

    const items = await getLeaveRecordsForUserDates(userId, [date]);

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.LEAVE_WRITE);

    const body = await request.json();

    const user = await getUserById(body.userId);
    if (!user) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(user._id),
      teamId: user.teamId,
    });

    const record = await createLeaveRecord(body, actor);

    await recalculateDays(
      String(record.userId),
      { from: record.date, to: record.date },
      { actor, reason: `${record.leaveType} leave recorded` },
    );

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

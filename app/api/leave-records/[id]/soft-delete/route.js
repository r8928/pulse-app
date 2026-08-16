import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  cancelLeaveRecord,
  getLeaveRecordById,
  getUserById,
} from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-26's cancel. The record is soft deleted rather than removed, and the
 * recalculation that follows REVERSES the LEAVE_AVAILED it produced — a ledger
 * movement is never edited or deleted (FR-6.8, I-1).
 *
 * Cancelling the authorisation does not make the absence disappear. If the day
 * had no punches, it becomes an ordinary unexcused absence and BR-9's
 * did-not-attend row applies, which is the correct outcome rather than a
 * leftover.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.LEAVE_WRITE);

    const record = await getLeaveRecordById(id);
    if (!record) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const user = await getUserById(record.userId);
    assertRecordInScope(scope, actor, {
      userId: String(record.userId),
      teamId: user?.teamId ?? null,
    });

    const { version, reason } = await request.json();
    const cancelled = await cancelLeaveRecord(id, reason, version, actor);

    await recalculateDays(
      String(record.userId),
      { from: record.date, to: record.date },
      { actor, reason },
    );

    return NextResponse.json(cancelled);
  } catch (error) {
    return errorResponse(error);
  }
}

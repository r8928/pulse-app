import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getUserById, overrideEntitlement } from '../../../../database.js';
import { leaveYearFor } from '../../../../engine/accrual.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * P-20, FR-2.7 and FR-6.10. Overrides the entitlement the engine prorated from
 * the date of joining or the tenure start.
 *
 * The engine's own credit is reversed rather than edited away, so S-14 shows
 * what was computed, that it was cancelled, and what an administrator put in
 * its place (FR-6.8).
 */
export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.LEAVE_WRITE);

    const { userId, leaveType, leaveYear, amount, reason } =
      await request.json();

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(user._id),
      teamId: user.teamId,
    });

    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      return NextResponse.json(
        { error: 'An entitlement must be a number.' },
        { status: 400 },
      );
    }

    const entry = await overrideEntitlement(
      {
        userId,
        leaveType,
        // The client names the year; this resolves its bounds, so the two
        // cannot disagree about when a leave year starts (BR-13).
        leaveYear: leaveYearFor(`${leaveYear}-01-01`),
        amount,
        reason,
      },
      actor,
    );

    return NextResponse.json(entry);
  } catch (error) {
    return errorResponse(error);
  }
}

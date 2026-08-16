import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../../constants/index.js';
import {
  clearDayOverride,
  getDayRecord,
  getUserById,
  setDayOverride,
} from '../../../../../../database.js';
import { recalculateDays } from '../../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../../utils/apiResponse.js';

/**
 * P-23, P-24 and P-25 — set a day's status, correct its hours, or waive a late
 * arrival or short day.
 *
 * FR-6.11: the new value is stored BESIDE the engine's, never in place of it,
 * and there is no separate override record. §23.1: where an override moves a
 * balance, the movement posts to the ledger in the normal way — which is why
 * both handlers recalculate the date afterwards rather than writing the record
 * and stopping.
 */
async function assertDayInScope(userId, date, actor, permission) {
  const scope = assertPermission(actor, permission);

  const user = await getUserById(userId);
  if (!user)
    return {
      error: NextResponse.json({ error: 'Not found.' }, { status: 404 }),
    };

  assertRecordInScope(scope, actor, {
    userId: String(user._id),
    teamId: user.teamId,
  });

  const dayRecord = await getDayRecord(userId, date);
  if (!dayRecord) {
    return {
      error: NextResponse.json(
        { error: `There is no day record for ${user.fullName} on ${date}.` },
        { status: 404 },
      ),
    };
  }

  return { user, dayRecord };
}

export async function PATCH(request, { params }) {
  try {
    const { userId, date } = await params;
    const actor = await requireActor();

    const { error } = await assertDayInScope(
      userId,
      date,
      actor,
      PERMISSIONS.ATTENDANCE_WRITE,
    );
    if (error) return error;

    const { version, ...override } = await request.json();
    const updated = await setDayOverride(
      userId,
      date,
      override,
      version,
      actor,
    );

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await recalculateDays(
      userId,
      { from: date, to: date },
      {
        actor,
        reason: override.reason,
      },
    );

    return NextResponse.json(await getDayRecord(userId, date));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Removing a human decision is itself a decision: it takes its own reason, is
 * audited, and reverses whatever the override had posted.
 */
export async function DELETE(request, { params }) {
  try {
    const { userId, date } = await params;
    const actor = await requireActor();

    const { error } = await assertDayInScope(
      userId,
      date,
      actor,
      PERMISSIONS.ATTENDANCE_WRITE,
    );
    if (error) return error;

    const { version, reason } = await request.json();
    const updated = await clearDayOverride(
      userId,
      date,
      reason,
      version,
      actor,
    );

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await recalculateDays(userId, { from: date, to: date }, { actor, reason });

    return NextResponse.json(await getDayRecord(userId, date));
  } catch (error) {
    return errorResponse(error);
  }
}

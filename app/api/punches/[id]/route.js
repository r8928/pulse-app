import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import {
  getPunchById,
  getUserById,
  updatePunch,
} from '../../../../database.js';
import { recalculateDays } from '../../../../engine/recalculate.js';
import { errorResponse } from '../../../../utils/apiResponse.js';
import { recalculationWindowFor } from '../../../../utils/recalculationWindow.js';

/**
 * P-21's edit. FR-4.12: a wrong punch is fixed by editing it — never by adding
 * a cancelling punch, never by overriding the day.
 *
 * The correction recalculates BOTH the day the punch left and the day it moved
 * to (MVP criterion 18). Recalculating only the new one would leave the old
 * day still counting hours nobody worked.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_WRITE);

    const before = await getPunchById(id);
    if (!before) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const owner = await getUserById(before.userId);
    assertRecordInScope(scope, actor, {
      userId: String(before.userId),
      teamId: owner?.teamId ?? null,
    });

    const { version, ...patch } = await request.json();
    const after = await updatePunch(id, patch, version, actor);

    if (!after) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    /**
     * The INSTANTS are what bound the window, not the stored work dates:
     * `before.workDate` may still be null if nothing has resolved it yet, and
     * the new one is not known until this recalculation itself resolves it.
     */
    const window = recalculationWindowFor([before.at, after.at]);

    await recalculateDays(String(before.userId), window, {
      actor,
      reason: patch.reason ?? 'Punch corrected',
    });

    // A punch moved onto a different user leaves the original user's days to
    // be refreshed as well — the hours have to disappear from one and appear
    // on the other.
    if (String(after.userId) !== String(before.userId)) {
      await recalculateDays(String(after.userId), window, {
        actor,
        reason: patch.reason ?? 'Punch corrected',
      });
    }

    return NextResponse.json(after);
  } catch (error) {
    return errorResponse(error);
  }
}

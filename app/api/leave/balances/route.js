import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import {
  getUserById,
  listTrackedUserIds,
  summariseBalances,
} from '../../../../database.js';
import { leaveYearsTouchedBy } from '../../../../engine/accrual.js';
import { ensureEntitlementCredited } from '../../../../engine/entitlement.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * S-13. FR-6.8 and DC-4: every figure is replayed from the ledger and never
 * stored, so this reads entries and sums them rather than looking up a column.
 *
 * D-12: the leave years the range touches are credited on the way through.
 * With no cron in the system, a balance read is one of the two moments a year
 * can credit itself — the other is a recalculation — and the guard is
 * idempotent, so reading twice credits once.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.LEAVE_READ);

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

    const userIds = userId
      ? [userId]
      : await listTrackedUserIds({ teamId: teamId || null });

    const years = leaveYearsTouchedBy({ from, to });

    for (const id of userIds) {
      for (const year of years) {
        await ensureEntitlementCredited(id, year, actor);
      }
    }

    return NextResponse.json(await summariseBalances({ userIds, from, to }));
  } catch (error) {
    return errorResponse(error);
  }
}

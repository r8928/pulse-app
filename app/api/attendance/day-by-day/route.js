import { NextResponse } from 'next/server';
import { assertPermission, requireActor } from '../../../../authz/guard.js';
import { rosterFiltersFor } from '../../../../authz/rosterScope.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { listTrackedUserIds } from '../../../../database.js';
import { buildDayByDay } from '../../../../engine/dayByDay.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * The detailed report, for the popup on the attendance summary.
 *
 * Read only, and gated on `attendance.read` rather than `report.build`: this
 * is a colleague reading their own days as much as an administrator reading
 * everyone's, which `FR-8.1` grants. Producing a FILE of it is the restricted
 * act, and that is still `/api/reports/export`.
 *
 * **The rows are chosen from the viewer's scope, never from the query.** The
 * caller is a client component, so `userIds` narrows what the scope already
 * allows and can never widen it — a handler that trusted the parameter would
 * hand the whole company to anyone willing to edit a query string, which is
 * the record half of `FR-1.2` skipped rather than enforced.
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

    const scoped = rosterFiltersFor(scope, actor, {
      teamId: url.searchParams.get('teamId'),
      userId: url.searchParams.get('userId'),
    });

    const asked = (url.searchParams.get('userIds') ?? '')
      .split(',')
      .filter(Boolean);

    const people = await buildDayByDay({
      userIds: await reachableUserIds(scoped, asked),
      from,
      to,
    });

    return NextResponse.json({ people, from, to });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Who the viewer may see, intersected with who they asked for.
 *
 * The intersection is the whole point: `scoped` is the ceiling and `asked` is
 * a preference underneath it. Naming a colleague outside the ceiling drops
 * them rather than raising it.
 */
async function reachableUserIds(scoped, asked) {
  // A SELF scope, or a scope that reaches nobody, has already been reduced to
  // a single id — there is nothing left for the query to narrow.
  if (scoped.userId) return [scoped.userId];

  const reachable = await listTrackedUserIds({ teamId: scoped.teamId ?? null });
  if (asked.length === 0) return reachable;

  const allowed = new Set(reachable);
  return asked.filter((id) => allowed.has(id));
}

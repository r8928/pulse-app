import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getUserById, postOpeningBalance } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * P-19, FR-6.13. Cutover only: the figure is entered by hand from the old
 * workbook, because historical attendance is deliberately not migrated and
 * there is nothing for the system to compute it from.
 *
 * The entry is labelled as an opening balance and carries its reason, so every
 * balance after it is still a replay rather than a starting number nobody can
 * account for.
 */
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

    return NextResponse.json(await postOpeningBalance(body, actor), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { getUserById, setUserFlag } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-13 and P-14. The two independent booleans of `FR-2.5`: whether attendance
 * is tracked, and whether the user may sign in.
 *
 * Both are audited with a mandatory reason and delete no history. Turning
 * tracking on starts producing day records from that point forward; turning it
 * off removes none already recorded (`FR-2.10`). Disabling login revokes
 * access without touching anything else (`FR-1.5`).
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_WRITE);

    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(existing._id),
      teamId: existing.teamId,
    });

    const { version, ...body } = await request.json();

    return NextResponse.json(await setUserFlag(id, body, version, actor));
  } catch (error) {
    return errorResponse(error);
  }
}

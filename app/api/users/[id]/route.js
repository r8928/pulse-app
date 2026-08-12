import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getUserById, updateUser } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * The record check runs here, not in proxy.js. proxy.js knows the path needs
 * user.read; only this handler knows which user is being asked for, and
 * FR-1.2 requires both checks.
 *
 * An out-of-scope record answers 404, so a MANAGER at TEAM scope cannot
 * discover that a user on another team exists by probing ids.
 */
const asRecord = (user) => ({ userId: String(user._id), teamId: user.teamId });

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_READ);

    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, asRecord(user));

    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.USER_WRITE);

    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, asRecord(existing));

    const { version, ...patch } = await request.json();
    const user = await updateUser(id, patch, version, actor);

    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

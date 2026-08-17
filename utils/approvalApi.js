import { NextResponse } from 'next/server';
import { assertPermission, requireActor } from '../authz/guard.js';
import { PERMISSIONS } from '../constants/index.js';
import { errorResponse } from './apiResponse.js';

/**
 * What `P-05`'s three decisions share. Approve, reject and restore differ only
 * in which engine call they make, so only that is passed in.
 *
 * All three need `user.write`: an `FR-2.11` decision soft deletes (or brings
 * back) a user's own records, and that is the permission governing them
 * everywhere else in the system. Reading the queue is `exceptions.read` and is
 * deliberately not enough.
 */
export async function decideOnApproval(request, context, decide) {
  try {
    const actor = await requireActor();
    assertPermission(actor, PERMISSIONS.USER_WRITE);

    const { id } = await context.params;
    const { reason, version } = await request.json();

    const after = await decide(id, reason, version, actor);

    return after
      ? NextResponse.json(after)
      : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import { assertPermission, requireActor } from '../../../../../authz/guard.js';
import {
  PERMISSIONS,
  REDUCTION_CHANGE,
} from '../../../../../constants/index.js';
import { softDeleteTenure } from '../../../../../database.js';
import { checkReduction } from '../../../../../engine/reduction.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-18. Refused when it is the user's last tenure that is not soft deleted:
 * `FR-2.12` says every user always keeps at least one.
 *
 * Removing a tenure removes the dates it covered from the employment period,
 * so `FR-2.11`'s check runs after it: any record now sitting outside is
 * queued on `S-05` for a decision rather than quietly soft deleted here.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    assertPermission(actor, PERMISSIONS.USER_WRITE);

    const { version, ...body } = await request.json();
    const removed = await softDeleteTenure(id, body, version, actor);

    if (!removed) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await checkReduction(
      removed.userId,
      { kind: REDUCTION_CHANGE.TENURE_SOFT_DELETED },
      actor,
    );

    return NextResponse.json(removed);
  } catch (error) {
    return errorResponse(error);
  }
}

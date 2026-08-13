import { NextResponse } from 'next/server';
import { assertPermission, requireActor } from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { updateTenure } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * P-17's edit. FR-2.12: editing corrects a wrong date but cannot close an open
 * tenure — an end date is set in one way only, by soft deleting the user.
 *
 * Both stored employment dates are rewritten in the same operation, so neither
 * can drift from the tenures they are derived from.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    assertPermission(actor, PERMISSIONS.USER_WRITE);

    const { version, ...patch } = await request.json();
    const updated = await updateTenure(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

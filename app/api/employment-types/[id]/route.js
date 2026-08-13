import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { updateEmploymentType } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * P-40's rename. Takes the version the caller loaded, so a concurrent edit is
 * rejected with the current state rather than silently overwritten (NFR-14).
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const updated = await updateEmploymentType(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

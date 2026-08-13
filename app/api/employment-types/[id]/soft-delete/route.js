import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteEmploymentType } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-40's destructive half — which destroys nothing (I-1). The type is soft
 * deleted so that every user who ever held it still resolves its name, and a
 * reason is mandatory (FR-4.10).
 *
 * The database refuses while any serving user still holds it, naming them.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const deleted = await softDeleteEmploymentType(id, body, version, actor);

    if (!deleted) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(deleted);
  } catch (error) {
    return errorResponse(error);
  }
}

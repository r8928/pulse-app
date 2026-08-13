import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createEmploymentType,
  listEmploymentTypes,
} from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * P-40. Employment types are company-wide configuration (FR-2.6, FR-6.4), so
 * they are editable at runtime with no redeploy and no permission depends on
 * any of them.
 *
 * proxy.js has already gated this path on config.read. These handlers assert
 * the permission their *method* needs, which the path alone cannot express — a
 * POST here creates configuration and must require config.write.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);

    return NextResponse.json(
      await listEmploymentTypes({
        includeDeleted: url.searchParams.get('includeDeleted') === 'true',
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const created = await createEmploymentType(await request.json(), actor);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createAuthorisedDomain,
  listAuthorisedDomains,
} from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * P-41. The Google Workspace domains permitted to sign in (FR-1.5), stored as
 * configuration so the company can change domain without a redeploy (FR-6.4).
 *
 * There is no PATCH: a domain is added or removed, never renamed. Renaming one
 * would silently change who can sign in while looking like an edit.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);

    return NextResponse.json(
      await listAuthorisedDomains({
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

    const created = await createAuthorisedDomain(await request.json(), actor);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

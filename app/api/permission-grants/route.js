import { NextResponse } from 'next/server';
import { validateGrants } from '../../../authz/check.js';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  getPermissionGrants,
  listPermissionGrants,
  setPermissionGrant,
} from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * S-19 and P-42. The screen that makes FR-1.2's FGAC half real: a change here
 * takes effect on the next request, with no code change and no redeploy,
 * because nothing caches grants (MVP criteria 4 and 7).
 *
 * FR-1.3 is enforced on the *resulting set*, not on the cell. The rule is that
 * OFFICE_ADMIN's grants are a permanent superset, which no single cell can be
 * checked against in isolation — so the proposed change is applied in memory,
 * the whole matrix is validated, and only then is anything written.
 *
 * That ordering is what makes the guarantee independent of what the client
 * sends. The locked OFFICE_ADMIN column on the screen stops the attempt; this
 * is what makes it impossible.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PERMISSION_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    return NextResponse.json(await listPermissionGrants());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PERMISSION_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...cell } = await request.json();

    const current = await getPermissionGrants();
    const proposed = [
      ...current.filter(
        (grant) =>
          !(grant.role === cell.role && grant.permission === cell.permission),
      ),
      { role: cell.role, permission: cell.permission, scope: cell.scope },
    ];

    const check = validateGrants(proposed);
    if (!check.valid) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    return NextResponse.json(await setPermissionGrant(cell, version, actor));
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { getTeamPolicy, updateTeamPolicy } from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-33 to P-39. The `FR-6.4` per-team list: leave types and entitlement,
 * accrual and carry forward, all three ladders, PTO validity, the WFH quota,
 * the thresholds and the two windows.
 *
 * Every one is data (`I-3`). A figure from `spec.md` 3.10 appearing in a `.js`
 * file is a defect, which is why this endpoint exists at all.
 *
 * A policy change alters how days already recorded were judged, so it
 * recalculates — and `FR-6.12` guarantees an override put there by a person
 * survives that recalculation untouched.
 */
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    // Null is the honest answer for a team nobody has configured yet. DC-6
    // forbids returning a defaulted policy that would look configured.
    return NextResponse.json(await getTeamPolicy(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const policy = await updateTeamPolicy(id, patch, version, actor);

    await recalculateDays(null, { from: null, to: null }, { teamId: id });

    return NextResponse.json(policy);
  } catch (error) {
    return errorResponse(error);
  }
}

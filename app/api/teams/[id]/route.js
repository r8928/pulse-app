import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getTeamConfiguration, updateTeam } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';

/**
 * S-17's read is the whole of one team's configuration in a single response —
 * the team, its shifts, its calendar, its pattern, its policy, and every value
 * still outstanding (`FR-3.13`).
 *
 * The gaps come from the same `policyCompleteness` function S-05 calls in
 * Phase 6, so an inline flag here and a queued exception there can never
 * disagree about whether a team is configured.
 */
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.TEAM_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const configuration = await getTeamConfiguration(id);
    if (!configuration) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(configuration);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.TEAM_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const updated = await updateTeam(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { createTeam, listTeams } from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * S-16 and P-28. Teams are company-wide configuration (`FR-3.2`), each with
 * exactly one manager (`FR-3.1`).
 *
 * proxy.js gates the path on team.read; a POST creates configuration and
 * asserts team.write here, because the path cannot tell the two apart.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.TEAM_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);

    return NextResponse.json(
      await listTeams({
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
    const scope = assertPermission(actor, PERMISSIONS.TEAM_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const created = await createTeam(await request.json(), actor);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

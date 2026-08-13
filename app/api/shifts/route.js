import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { createShift, listShifts } from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * P-30. Named shifts, per team (`FR-3.3`), each carrying its own timezone —
 * there is deliberately no company-wide one to fall back on (`FR-3.10`,
 * `DC-5`), so an unset timezone is rejected rather than filled in.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);
    const teamId = url.searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'A team is required — shifts are per team configuration.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await listShifts(teamId, {
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

    const created = await createShift(await request.json(), actor);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

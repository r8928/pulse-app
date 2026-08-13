import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  getWeeklyOffPattern,
  setWeeklyOffPattern,
} from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-32. Which days of the week this team does not work — `FR-3.8` is explicit
 * that this is not assumed to be Saturday and Sunday.
 *
 * Exactly one pattern per team, replaced in place. `version` is null the first
 * time, when the team has none yet.
 */
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    return NextResponse.json(await getWeeklyOffPattern(id));
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

    const { version, ...body } = await request.json();
    const pattern = await setWeeklyOffPattern(id, body, version, actor);

    // The day type of every date on this team changes with the pattern.
    await recalculateDays(null, { from: null, to: null });

    return NextResponse.json(pattern);
  } catch (error) {
    return errorResponse(error);
  }
}

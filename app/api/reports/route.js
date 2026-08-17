import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { buildAttendanceReport } from '../../../engine/reports.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * `S-20`, `FR-8.3`. An attendance report for any date range, per user and per
 * team.
 *
 * `report.build` is restricted and explicitly **not** granted to `EMPLOYEE`,
 * unlike the `S-09` read surface (`FR-8.1`) — which is why this gates on it
 * rather than on `attendance.read`.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.REPORT_BUILD);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: 'A date range is required — from and to.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await buildAttendanceReport({
        from,
        to,
        teamId: url.searchParams.get('teamId') || null,
        userId: url.searchParams.get('userId') || null,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

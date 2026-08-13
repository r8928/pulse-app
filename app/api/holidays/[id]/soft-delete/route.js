import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteHoliday } from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * P-31's removal. Soft delete, so a day record computed while the date was a
 * holiday can still explain why.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const removed = await softDeleteHoliday(id, body, version, actor);

    if (!removed) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await recalculateDays(null, { from: removed.date, to: removed.date });

    return NextResponse.json(removed);
  } catch (error) {
    return errorResponse(error);
  }
}

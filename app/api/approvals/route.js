import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { listPendingApprovals } from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * `S-05`'s twelfth queue. `FR-2.11`'s reductions awaiting a decision, each
 * naming the user, the change that caused it and every record approval would
 * soft delete.
 *
 * Reading the queue gates on `exceptions.read`; deciding on one needs
 * `user.write`, asserted in each decision handler — a reduction soft deletes
 * a user's records, which is the permission that governs them everywhere else.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.EXCEPTIONS_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const items = await listPendingApprovals();

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return errorResponse(error);
  }
}

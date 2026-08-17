import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  countExceptionQueues,
  listExceptionQueue,
} from '../../../engine/exceptions.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * `S-05`. One queue when asked for one, every count when not.
 *
 * `exceptions.read` is held by `OFFICE_ADMIN` and explicitly withheld from
 * `EMPLOYEE` (`FR-8.1`). It is company-wide by nature — the dashboard is the
 * single work queue for the whole system — so the record check is `COMPANY_WIDE`
 * rather than per user.
 *
 * `NFR-3`: paged, never fully materialised. `page` and `pageSize` reach the
 * engine unchanged and the total comes back beside the page.
 */
export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.EXCEPTIONS_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);
    const queue = url.searchParams.get('queue');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: 'A date range is required — from and to.' },
        { status: 400 },
      );
    }

    const options = {
      from,
      to,
      page: Number(url.searchParams.get('page') ?? 1),
      pageSize: Number(url.searchParams.get('pageSize') ?? 25),
    };

    if (!queue) {
      return NextResponse.json({ counts: await countExceptionQueues(options) });
    }

    return NextResponse.json(await listExceptionQueue(queue, options));
  } catch (error) {
    return errorResponse(error);
  }
}

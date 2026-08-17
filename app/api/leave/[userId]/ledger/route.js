import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import {
  LEDGER_ENTRY_TYPE,
  PERMISSIONS,
} from '../../../../../constants/index.js';
import {
  getUserById,
  listLedgerEntriesForUser,
} from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * S-14. Every immutable balance movement, in order, with the rule that
 * produced it — the proof behind every number the app displays (NFR-11).
 *
 * **There is deliberately no PATCH, PUT or DELETE in this file.** FR-6.8 makes
 * the ledger append-only: a movement is cancelled by appending its reverse,
 * never by editing or deleting the original. The screen offers no edit control
 * because no endpoint exists to call, and a test asserts these exports stay
 * absent.
 */
export async function GET(request, { params }) {
  try {
    const { userId } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.LEAVE_READ);

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(user._id),
      teamId: user.teamId,
    });

    const url = new URL(request.url);

    const entries = await listLedgerEntriesForUser(userId, {
      leaveType: url.searchParams.get('leaveType'),
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
    });

    /**
     * The running balance is computed here rather than on the screen, so the
     * figure a reader checks against comes from the same ordering the entries
     * were read in. A client that re-sorted would show a different trace of the
     * same ledger.
     */
    let running = 0;
    const withRunning = entries.map((entry) => {
      running += entry.amount;
      return { ...entry, runningBalance: running };
    });

    return NextResponse.json({
      entries: withRunning,
      /**
       * FR-6.13: a user created after cutover has no opening entry, and S-14
       * says so rather than showing a zero row.
       */
      hasOpeningBalance: entries.some(
        (entry) => entry.entryType === LEDGER_ENTRY_TYPE.OPENING_BALANCE,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

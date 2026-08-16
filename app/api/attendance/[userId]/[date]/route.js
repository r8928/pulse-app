import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  getDayRecord,
  getLeaveRecordsForUserDates,
  getUserById,
  listLedgerEntriesForSource,
  listPunchesForUserDates,
} from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * S-12. Everything the engine concluded about one user on one date, and why —
 * the punches it read, the values it computed, any override sitting beside
 * them, and the ledger movements the day produced.
 *
 * All four come back in one response because they are one question. Splitting
 * them across four requests would let the screen render a deduction beside a
 * ledger that no longer agrees with it.
 */
export async function GET(_request, { params }) {
  try {
    const { userId, date } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_READ);

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    assertRecordInScope(scope, actor, {
      userId: String(user._id),
      teamId: user.teamId,
    });

    const dayRecord = await getDayRecord(userId, date);

    if (!dayRecord) {
      // FR-2.12: a date in a tenure gap carries no day record at all, and
      // saying so is the answer rather than an empty shell that implies the
      // person was absent.
      return NextResponse.json(
        {
          error: `There is no day record for ${user.fullName} on ${date}. A date outside their employment period, or one nothing has touched, carries none.`,
        },
        { status: 404 },
      );
    }

    const [punches, leaveRecords, ledgerEntries] = await Promise.all([
      listPunchesForUserDates(userId, [date], { includeDeleted: true }),
      getLeaveRecordsForUserDates(userId, [date]),
      listLedgerEntriesForSource('dayRecord', String(dayRecord._id)),
    ]);

    return NextResponse.json({
      dayRecord,
      punches,
      leaveRecord: leaveRecords[0] ?? null,
      ledgerEntries,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

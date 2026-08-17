import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  commitAttendanceImport,
  recordImportExceptions,
} from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * S-11 step 4. FR-4.5: every accepted row is written or none is.
 *
 * The punches land with no work date; this then recalculates each user over
 * the range the import touched, which is what resolves those dates (§13) and
 * produces the day records and ledger movements they imply.
 *
 * I-6 and MVP criterion 18: re-running an import does not undo an override
 * already applied — `recalculateDays` refreshes the computed values and leaves
 * every human decision standing.
 */
export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_IMPORT);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { rows, rejected = [] } = await request.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'There are no accepted rows to import.' },
        { status: 400 },
      );
    }

    const { inserted, userIds, dates } = await commitAttendanceImport(
      rows,
      actor,
    );

    // D-26: the rejected rows are queued HERE rather than at the preview. A
    // preview asserts nothing about the file — only a commit says somebody
    // meant to import it, and only then is a bad row worth chasing on S-05.
    await recordImportExceptions(rejected, actor);

    let recalculated = 0;

    for (const userId of userIds) {
      const result = await recalculateDays(
        userId,
        { from: dates[0], to: dates.at(-1) },
        { actor, reason: 'Attendance imported' },
      );
      recalculated += result.recalculated;
    }

    return NextResponse.json({ inserted, recalculated });
  } catch (error) {
    return errorResponse(error);
  }
}

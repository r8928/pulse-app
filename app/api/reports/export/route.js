import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { errorResponse } from '../../../../utils/apiResponse.js';
import { toCsv, toXlsx } from '../../../../utils/reportExport.js';

/**
 * `P-43`, `FR-8.5`. Excel or CSV, **of the report as currently filtered**.
 *
 * The rows come up with the request rather than being re-queried here. That
 * is deliberate: a second query could return something the sender never saw,
 * and nobody would know which of the two was the real report. What lands in
 * the file is exactly what was on the screen.
 */
const FORMATS = {
  csv: {
    type: 'text/csv; charset=utf-8',
    extension: 'csv',
    build: async (payload) => toCsv(payload),
  },
  xlsx: {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
    build: (payload) => toXlsx(payload),
  },
};

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.REPORT_BUILD);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const {
      format = 'csv',
      columns,
      rows,
      filename = 'pulse-report',
    } = await request.json();

    const shape = FORMATS[format];
    if (!shape) {
      return NextResponse.json(
        { error: `Unknown export format ${format}. Use csv or xlsx.` },
        { status: 400 },
      );
    }

    if (!Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: 'There are no columns to export.' },
        { status: 400 },
      );
    }

    const body = await shape.build({ columns, rows: rows ?? [] });

    return new NextResponse(body, {
      headers: {
        'Content-Type': shape.type,
        'Content-Disposition': `attachment; filename="${filename}.${shape.extension}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import ExcelJS from 'exceljs';

/**
 * `FR-8.5`, `P-43`. Export a report to Excel or CSV, so the office
 * administration team can keep sharing files during the transition.
 *
 * The export is **of the report as currently filtered** — it takes the rows
 * the screen is showing rather than re-querying, so what lands in the file is
 * exactly what the sender was looking at. A second query could disagree with
 * the screen, and nobody would know which was right.
 */

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** RFC 4180 quoting, because a colleague's name can contain a comma. */
export function toCsv({ columns, rows }) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row[column.key])).join(','),
  );

  return [header, ...body].join('\n');
}

export async function toXlsx({ columns, rows, sheetName = 'Report' }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.max(12, column.label.length + 2),
  }));

  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

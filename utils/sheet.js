import ExcelJS from 'exceljs';

/**
 * Reads an uploaded workbook into plain row objects keyed by column heading.
 *
 * Shared by the roster import (`S-08`) and the attendance import (`S-11`),
 * which read differently shaped sheets the same way.
 *
 * ExcelJS returns 1-indexed **sparse** arrays from `getSheetValues`: index 0
 * is a hole, and `Array.prototype.map` preserves holes rather than visiting
 * them — which hands `Object.fromEntries` an `undefined` instead of a pair and
 * throws. `Array.from` fills them, so this has to stay as it is written.
 *
 * @param {File|Blob} file the uploaded workbook
 * @param {{ sheetName?: string }} [options] a named sheet, else the first
 * @returns {Promise<Array<Record<string, unknown>>>} one object per data row
 */
export async function readSheetRows(file, { sheetName } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet =
    (sheetName ? workbook.getWorksheet(sheetName) : null) ??
    workbook.worksheets.at(0);

  if (!sheet) {
    throw new Error('That file has no readable sheet in it.');
  }

  const [header, ...body] = sheet.getSheetValues().filter(Boolean);

  const columns = Array.from(header ?? [], (cell) =>
    cell === null || cell === undefined ? '' : String(cell).trim(),
  )
    // The 1-index hole becomes an unnamed column, as does any blank heading.
    // Neither identifies anything, so neither reaches the caller.
    .map((name, index) => ({ name, index }))
    .filter((column) => column.name !== '');

  return body.map((row) => {
    const cells = Array.from(row ?? []);
    return Object.fromEntries(
      columns.map((column) => [column.name, cells[column.index] ?? null]),
    );
  });
}

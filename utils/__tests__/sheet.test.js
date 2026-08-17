import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readSheetRows } from '../sheet.js';

/**
 * The sheet reader both imports use. Its one subtlety — ExcelJS returns
 * sparse, 1-indexed arrays — is the reason it exists once rather than twice.
 */

async function workbookOf(rows, sheetName = 'Sheet1') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of rows) sheet.addRow(row);

  return new Blob([Buffer.from(await workbook.xlsx.writeBuffer())]);
}

describe('readSheetRows', () => {
  it('keys each data row by its column heading', async () => {
    const file = await workbookOf([
      ['Employee Code', 'Employee Name'],
      ['E-001', 'Aisha Khan'],
      ['E-002', 'Chen Wei'],
    ]);

    expect(await readSheetRows(file)).toEqual([
      { 'Employee Code': 'E-001', 'Employee Name': 'Aisha Khan' },
      { 'Employee Code': 'E-002', 'Employee Name': 'Chen Wei' },
    ]);
  });

  it('reads a named sheet in preference to the first', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Other').addRow(['Employee Code']);
    const wanted = workbook.addWorksheet('Biometric ID');
    wanted.addRow(['Employee Code']);
    wanted.addRow(['E-009']);

    const file = new Blob([Buffer.from(await workbook.xlsx.writeBuffer())]);

    expect(await readSheetRows(file, { sheetName: 'Biometric ID' })).toEqual([
      { 'Employee Code': 'E-009' },
    ]);
  });

  it('falls back to the first sheet when the named one is absent', async () => {
    const file = await workbookOf([['Employee Code'], ['E-001']], 'Whatever');

    expect(await readSheetRows(file, { sheetName: 'Missing' })).toEqual([
      { 'Employee Code': 'E-001' },
    ]);
  });

  it('reads an empty cell as null rather than dropping the column', async () => {
    const file = await workbookOf([
      ['Employee Code', 'Employee Name'],
      ['E-001'],
    ]);

    expect(await readSheetRows(file)).toEqual([
      { 'Employee Code': 'E-001', 'Employee Name': null },
    ]);
  });

  it('returns nothing for a sheet with only a header', async () => {
    const file = await workbookOf([['Employee Code']]);

    expect(await readSheetRows(file)).toEqual([]);
  });

  it('trims a heading, so a stray space does not lose a column', async () => {
    const file = await workbookOf([['  Employee Code  '], ['E-001']]);

    expect(await readSheetRows(file)).toEqual([{ 'Employee Code': 'E-001' }]);
  });
});

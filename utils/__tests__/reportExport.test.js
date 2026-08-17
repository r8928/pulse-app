import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { toCsv, toXlsx } from '../reportExport.js';

/**
 * `FR-8.5`, `P-43`. The export is of the report **as currently filtered** —
 * it takes the rows the screen is showing rather than re-querying, so what
 * lands in the file is exactly what the sender was looking at.
 */

const columns = [
  { key: 'fullName', label: 'Employee' },
  { key: 'workingDays', label: 'Working days' },
  { key: 'present', label: 'Present' },
];

const rows = [
  { fullName: 'Aisha Khan', workingDays: 22, present: 21 },
  { fullName: 'Ahmed, Bilal', workingDays: 22, present: 20 },
];

describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    const csv = toCsv({ columns, rows });

    expect(csv.split('\n')).toHaveLength(3);
    expect(csv.split('\n')[0]).toBe('Employee,Working days,Present');
  });

  it('quotes a value containing a comma, because a name can contain one', () => {
    const csv = toCsv({ columns, rows });

    expect(csv).toContain('"Ahmed, Bilal"');
  });

  it('doubles an embedded quote rather than breaking the row (RFC 4180)', () => {
    const csv = toCsv({
      columns: [{ key: 'note', label: 'Note' }],
      rows: [{ note: 'He said "fine"' }],
    });

    expect(csv).toContain('"He said ""fine"""');
  });

  it('writes an empty cell for a missing value rather than "undefined"', () => {
    const csv = toCsv({ columns, rows: [{ fullName: 'Aisha Khan' }] });

    expect(csv).toContain('Aisha Khan,,');
    expect(csv).not.toContain('undefined');
  });

  it('writes a header alone for an empty report', () => {
    expect(toCsv({ columns, rows: [] }).split('\n')).toHaveLength(1);
  });
});

describe('toXlsx', () => {
  it('produces a workbook a spreadsheet can actually open', async () => {
    const buffer = await toXlsx({ columns, rows });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Report');

    expect(sheet.getRow(1).getCell(1).value).toBe('Employee');
    expect(sheet.getRow(2).getCell(1).value).toBe('Aisha Khan');
    expect(sheet.getRow(2).getCell(2).value).toBe(22);
  });

  it('keeps the numbers as numbers, so the sheet can total them', async () => {
    const buffer = await toXlsx({ columns, rows });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const value = workbook.getWorksheet('Report').getRow(2).getCell(2).value;

    expect(typeof value).toBe('number');
  });
});

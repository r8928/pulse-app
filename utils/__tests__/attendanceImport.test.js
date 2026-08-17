import { describe, expect, it } from 'vitest';
import { PUNCH_TYPE } from '../../constants/index.js';
import { DATE_FORMATS, validateAttendanceRows } from '../attendanceImport.js';

/**
 * FR-4.2 to FR-4.5 and FR-4.11. The biometric export, validated before
 * anything is committed.
 *
 * Pure: it takes the parsed rows and the users already known, and returns what
 * would happen. Nothing here touches the database — which is also what lets
 * NFR-4's 40,000 rows validate in one in-memory pass rather than one query
 * per row.
 */

const user = {
  _id: 'u1',
  fullName: 'Aisha Khan',
  employeeCode: 'E-001',
  tracked: true,
  timezone: 'Asia/Karachi',
  tenures: [{ startDate: '2025-01-01', endDate: null, deletedAt: null }],
};

const usersByCode = new Map([
  ['E-001', user],
  [
    'E-002',
    {
      ...user,
      _id: 'u2',
      employeeCode: 'E-002',
      fullName: 'Contractor',
      tracked: false,
    },
  ],
  [
    'E-003',
    {
      ...user,
      _id: 'u3',
      employeeCode: 'E-003',
      fullName: 'Late Joiner',
      tenures: [{ startDate: '2026-09-01', endDate: null, deletedAt: null }],
    },
  ],
]);

const row = (overrides = {}) => ({
  'Sr No.': 1,
  'Employee Code': 'E-001',
  'Employee Name': 'Aisha Khan',
  Type: 'Check In',
  Date: '12/08/2026',
  Time: '09:02',
  ...overrides,
});

const validate = (rows, dateFormat = DATE_FORMATS.DMY.value) =>
  validateAttendanceRows(rows, { usersByCode, dateFormat });

describe('validateAttendanceRows', () => {
  it('accepts a good row, resolving it to an instant in the shift timezone', () => {
    const { accepted, rejected } = validate([row()]);

    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({
      userId: 'u1',
      type: PUNCH_TYPE.CHECK_IN,
      employeeCode: 'E-001',
    });
    // 09:02 in Asia/Karachi is 04:02Z.
    expect(accepted[0].at).toBe('2026-08-12T04:02:00.000Z');
  });

  it('rejects a row with no employee code, saying the code is the only match key', () => {
    const { rejected } = validate([row({ 'Employee Code': '' })]);

    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/no employee code/i);
  });

  it('rejects a code matching no user', () => {
    const { rejected } = validate([row({ 'Employee Code': 'E-999' })]);

    expect(rejected[0].reason).toMatch(/matches no user/i);
  });

  it('rejects an untracked user, naming that as the reason (FR-2.10)', () => {
    const { rejected } = validate([
      row({ 'Employee Code': 'E-002', 'Employee Name': 'Contractor' }),
    ]);

    expect(rejected[0].reason).toMatch(/not tracked/i);
  });

  it('rejects a date that cannot be parsed under the confirmed format', () => {
    const { rejected } = validate([row({ Date: '31/31/2026' })]);

    expect(rejected[0].reason).toMatch(/could not be read/i);
  });

  it('rejects a date outside the user’s employment period (FR-2.12)', () => {
    const { rejected } = validate([row({ 'Employee Code': 'E-003' })]);

    expect(rejected[0].reason).toMatch(/employment period/i);
  });

  it('rejects an unreadable time', () => {
    const { rejected } = validate([row({ Time: 'half nine' })]);

    expect(rejected[0].reason).toMatch(/time/i);
  });

  it('rejects a type that is neither a check in nor a check out', () => {
    const { rejected } = validate([row({ Type: 'Lunch' })]);

    expect(rejected[0].reason).toMatch(/check in or check out/i);
  });

  it('matches on the code alone and never on the name (FR-4.3)', () => {
    // The name in the sheet is wrong; the code is right. The row is accepted
    // against the code's user, and the sheet's name changes nothing.
    const { accepted } = validate([row({ 'Employee Name': 'Someone Else' })]);

    expect(accepted[0].userId).toBe('u1');
    expect(accepted[0].fullName).toBe('Aisha Khan');
  });

  it('reads the same date differently under the two offered formats (FR-4.11)', () => {
    // 03/04/2026 is 3 April under DD/MM and 4 March under MM/DD. Confirming
    // the format is what stops the system picking one.
    const dmy = validateAttendanceRows([row({ Date: '03/04/2026' })], {
      usersByCode,
      dateFormat: DATE_FORMATS.DMY.value,
    });
    const mdy = validateAttendanceRows([row({ Date: '03/04/2026' })], {
      usersByCode,
      dateFormat: DATE_FORMATS.MDY.value,
    });

    // Asia/Karachi is UTC+5, so 09:02 local is 04:02Z on the same date.
    expect(dmy.accepted[0].at).toBe('2026-04-03T04:02:00.000Z'); // 3 Apr
    expect(mdy.accepted[0].at).toBe('2026-03-04T04:02:00.000Z'); // 4 Mar
  });

  it('reads an ISO date too, which some exports produce', () => {
    const { accepted } = validate(
      [row({ Date: '2026-08-12' })],
      DATE_FORMATS.ISO.value,
    );
    expect(accepted).toHaveLength(1);
  });

  it('reports the sheet row of each rejection, so it can be found and fixed', () => {
    const { rejected } = validate([row(), row({ 'Employee Code': '' })]);

    // Row 1 is the header, so the second data row is sheet row 3.
    expect(rejected[0].sheetRow).toBe(3);
  });

  it('keeps the name in each rejection, for the reader rather than for matching', () => {
    const { rejected } = validate([row({ 'Employee Code': 'E-999' })]);

    expect(rejected[0].fullName).toBe('Aisha Khan');
  });

  it('handles an empty sheet without throwing', () => {
    expect(validate([])).toEqual({ accepted: [], rejected: [] });
  });
});

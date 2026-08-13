import { describe, expect, it } from 'vitest';
import {
  outstandingDetails,
  readyToCommit,
  validateRosterRows,
} from '../rosterImport.js';

/**
 * FR-2.9 and DC-6. The whole point of this screen is that it guesses nothing:
 * every field the sheet does not carry is prompted for, and the commit stays
 * blocked until each one is answered.
 */

const row = (code, name) => ({
  'Employee Code': code,
  'Employee Name': name,
});

describe('validateRosterRows', () => {
  it('accepts a well-formed row', () => {
    const { accepted, rejected } = validateRosterRows(
      [row('EMP-001', 'Alice Adeyemi')],
      new Set(),
    );

    expect(rejected).toEqual([]);
    expect(accepted[0]).toMatchObject({
      employeeCode: 'EMP-001',
      fullName: 'Alice Adeyemi',
      sheetRow: 2,
    });
  });

  it('rejects a row with no employee code, stating that as the reason', () => {
    const { rejected } = validateRosterRows(
      [row('', 'Alice Adeyemi')],
      new Set(),
    );

    expect(rejected[0].reason).toMatch(/no employee code/i);
  });

  it('never uses a name to match, so a nameless row is rejected too', () => {
    const { rejected } = validateRosterRows([row('EMP-001', '')], new Set());
    expect(rejected[0].reason).toMatch(/no name/i);
  });

  it('rejects a code that already belongs to somebody, including a departed one', () => {
    // FR-2.6: unique across all users, so a leaver's records are never
    // reattached to a new joiner given the same code.
    const { rejected } = validateRosterRows(
      [row('EMP-001', 'Alice Adeyemi')],
      new Set(['EMP-001']),
    );

    expect(rejected[0].reason).toMatch(/already belongs/i);
  });

  it('rejects the second appearance of a code inside one sheet, naming the first row', () => {
    const { accepted, rejected } = validateRosterRows(
      [row('EMP-001', 'Alice'), row('EMP-001', 'Alice again')],
      new Set(),
    );

    expect(accepted).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/appears twice.*row 2/i);
  });

  it('trims surrounding whitespace rather than treating it as a different code', () => {
    const { accepted } = validateRosterRows(
      [row('  EMP-001  ', '  Alice  ')],
      new Set(),
    );

    expect(accepted[0]).toMatchObject({
      employeeCode: 'EMP-001',
      fullName: 'Alice',
    });
  });

  it('numbers rows as the reader sees them, with the header as row 1', () => {
    const { rejected } = validateRosterRows(
      [row('EMP-001', 'Alice'), row('', 'Nobody')],
      new Set(),
    );

    expect(rejected[0].sheetRow).toBe(3);
  });
});

describe('outstandingDetails', () => {
  const complete = {
    employeeCode: 'EMP-001',
    fullName: 'Alice',
    teamId: 't1',
    employmentType: 'PERMANENT',
    tracked: true,
    loginEnabled: true,
    dateOfJoining: '2026-01-05',
    shiftId: 's1',
  };

  it('reports nothing outstanding for a complete row', () => {
    expect(outstandingDetails(complete)).toEqual([]);
  });

  it('names every field the sheet does not carry', () => {
    expect(outstandingDetails({ employeeCode: 'EMP-001' })).toEqual(
      expect.arrayContaining([
        'teamId',
        'employmentType',
        'tracked',
        'loginEnabled',
        'dateOfJoining',
        'shiftId',
      ]),
    );
  });

  it('treats false as an answer rather than as an unset value', () => {
    // Someone deliberately marked untracked has answered the question.
    expect(
      outstandingDetails({ ...complete, tracked: false, shiftId: null }),
    ).toEqual([]);
  });

  it('requires a shift for a tracked user and not for an untracked one', () => {
    // FR-3.4.
    expect(outstandingDetails({ ...complete, shiftId: null })).toContain(
      'shiftId',
    );
    expect(
      outstandingDetails({ ...complete, tracked: false, shiftId: null }),
    ).not.toContain('shiftId');
  });

  it('never requires a work email, which support staff genuinely lack', () => {
    // FR-2.6 and FR-1.5.
    expect(outstandingDetails({ ...complete, workEmail: null })).not.toContain(
      'workEmail',
    );
  });
});

describe('readyToCommit', () => {
  const complete = {
    teamId: 't1',
    employmentType: 'PERMANENT',
    tracked: true,
    loginEnabled: true,
    dateOfJoining: '2026-01-05',
    shiftId: 's1',
  };

  it('blocks the commit while any row is incomplete', () => {
    expect(readyToCommit([complete, { teamId: 't1' }])).toBe(false);
  });

  it('allows it once every row is answered', () => {
    expect(readyToCommit([complete])).toBe(true);
  });

  it('blocks an empty sheet, which commits nothing worth committing', () => {
    expect(readyToCommit([])).toBe(false);
  });
});

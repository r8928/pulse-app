import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_TYPE_SEEDS, ROLES } from '../../constants/index.js';
import {
  DATE_OF_JOINING_COLUMN,
  EMPLOYEE_CODE_COLUMN,
  EMPLOYEE_NAME_COLUMN,
  EMPLOYMENT_TYPE_COLUMN,
  LOGIN_ENABLED_COLUMN,
  PHONE_COLUMN,
  ROLE_COLUMN,
  SHEET_COLUMNS,
  TRACKED_COLUMN,
  validateRosterRows,
  WORK_EMAIL_COLUMN,
} from '../rosterImport.js';

/**
 * The optional columns, which carry the `FR-2.6` fields the sheet used not to.
 *
 * Two rules run through all of them. A blank cell is not an answer and not an
 * error: the field stays outstanding and `S-08` step 2 asks for it, exactly as
 * before. A cell that is filled in but unreadable rejects the row and says
 * why — because the alternative is silently substituting a default, and a
 * mistyped role quietly becoming EMPLOYEE is how someone ends up with the
 * wrong access (`DC-6`).
 */

const employmentTypes = Object.values(EMPLOYMENT_TYPE_SEEDS);

const row = (overrides = {}) => ({
  [EMPLOYEE_CODE_COLUMN]: 'EMP-001',
  [EMPLOYEE_NAME_COLUMN]: 'Alice Adeyemi',
  ...overrides,
});

const validate = (rows, options = {}) =>
  validateRosterRows(rows, new Set(), { employmentTypes, ...options });

describe('SHEET_COLUMNS', () => {
  it('names the two columns that identify a person as required', () => {
    const required = SHEET_COLUMNS.filter((column) => column.required).map(
      (column) => column.name,
    );

    expect(required).toEqual([EMPLOYEE_CODE_COLUMN, EMPLOYEE_NAME_COLUMN]);
  });

  it('carries every field the create-user form takes', () => {
    expect(SHEET_COLUMNS.map((column) => column.name)).toEqual([
      EMPLOYEE_CODE_COLUMN,
      EMPLOYEE_NAME_COLUMN,
      PHONE_COLUMN,
      WORK_EMAIL_COLUMN,
      EMPLOYMENT_TYPE_COLUMN,
      ROLE_COLUMN,
      DATE_OF_JOINING_COLUMN,
      TRACKED_COLUMN,
      LOGIN_ENABLED_COLUMN,
    ]);
  });
});

describe('validateRosterRows with the optional columns', () => {
  it('carries every filled column through onto the accepted row', () => {
    const { accepted } = validate([
      row({
        [WORK_EMAIL_COLUMN]: 'alice@citrusbits.com',
        [EMPLOYMENT_TYPE_COLUMN]: 'PERMANENT',
        [ROLE_COLUMN]: 'MANAGER',
        [DATE_OF_JOINING_COLUMN]: '2024-03-11',
        [TRACKED_COLUMN]: 'TRUE',
        [LOGIN_ENABLED_COLUMN]: 'FALSE',
      }),
    ]);

    expect(accepted[0]).toMatchObject({
      workEmail: 'alice@citrusbits.com',
      employmentType: 'PERMANENT',
      role: ROLES.MANAGER,
      dateOfJoining: '2024-03-11',
      tracked: true,
      loginEnabled: false,
    });
  });

  it('leaves a blank cell unanswered rather than filling one in', () => {
    const { accepted, rejected } = validate([row()]);

    expect(rejected).toEqual([]);
    expect(accepted[0].employmentType).toBe('');
    expect(accepted[0].dateOfJoining).toBe('');
    expect(accepted[0].role).toBeNull();
    expect(accepted[0].tracked).toBeNull();
  });

  it('reads a real date cell, which Excel hands over as a date rather than text', () => {
    const { accepted } = validate([
      // ExcelJS returns a UTC Date for a date-formatted cell.
      row({ [DATE_OF_JOINING_COLUMN]: new Date(Date.UTC(2024, 2, 11)) }),
    ]);

    expect(accepted[0].dateOfJoining).toBe('2024-03-11');
  });

  it('refuses an ambiguous written date instead of picking a reading', () => {
    // 03/04/2024 is two different days either side of the Atlantic.
    const { rejected } = validate([
      row({ [DATE_OF_JOINING_COLUMN]: '03/04/2024' }),
    ]);

    expect(rejected[0].reason).toMatch(/date of joining/i);
    expect(rejected[0].reason).toMatch(/YYYY-MM-DD/);
  });

  it('accepts the ways a person writes yes and no', () => {
    const { accepted } = validate([
      row({ [TRACKED_COLUMN]: 'Yes', [LOGIN_ENABLED_COLUMN]: 'no' }),
      row({
        [EMPLOYEE_CODE_COLUMN]: 'EMP-002',
        [TRACKED_COLUMN]: 1,
        [LOGIN_ENABLED_COLUMN]: false,
      }),
    ]);

    expect(accepted[0]).toMatchObject({ tracked: true, loginEnabled: false });
    expect(accepted[1]).toMatchObject({ tracked: true, loginEnabled: false });
  });

  it('rejects a yes-or-no column that says something else', () => {
    const { rejected } = validate([row({ [TRACKED_COLUMN]: 'sometimes' })]);

    expect(rejected[0].reason).toMatch(/attendance tracked/i);
    expect(rejected[0].reason).toMatch(/sometimes/);
  });

  it('rejects an employment type the company does not have, listing the ones it does', () => {
    const { rejected } = validate([
      row({ [EMPLOYMENT_TYPE_COLUMN]: 'Permanant' }),
    ]);

    expect(rejected[0].reason).toMatch(/Permanant/);
    expect(rejected[0].reason).toMatch(/PERMANENT/);
  });

  it('matches an employment type regardless of case, since the name is the key', () => {
    const { accepted } = validate([
      row({ [EMPLOYMENT_TYPE_COLUMN]: 'permanent' }),
    ]);

    expect(accepted[0].employmentType).toBe('PERMANENT');
  });

  it('rejects a role that is not one of the four', () => {
    const { rejected } = validate([row({ [ROLE_COLUMN]: 'Administrator' })]);

    expect(rejected[0].reason).toMatch(/role/i);
    expect(rejected[0].reason).toMatch(/Administrator/);
  });

  it('rejects a work email that is not an address', () => {
    const { rejected } = validate([
      row({ [WORK_EMAIL_COLUMN]: 'alice at citrusbits' }),
    ]);

    expect(rejected[0].reason).toMatch(/work email/i);
  });

  it('reads an email that Excel turned into a link object', () => {
    // A typed address becomes a hyperlink cell: { text, hyperlink }.
    const { accepted } = validate([
      row({
        [WORK_EMAIL_COLUMN]: {
          text: 'alice@citrusbits.com',
          hyperlink: 'mailto:alice@citrusbits.com',
        },
      }),
    ]);

    expect(accepted[0].workEmail).toBe('alice@citrusbits.com');
  });

  it('still rejects a row with no code before it looks at anything else', () => {
    const { rejected } = validate([
      row({ [EMPLOYEE_CODE_COLUMN]: '', [ROLE_COLUMN]: 'Administrator' }),
    ]);

    expect(rejected[0].reason).toMatch(/no employee code/i);
  });
});

/**
 * The phone number, which the sheet may carry and need not.
 *
 * It is the one optional field with no shape to check beyond being written
 * down: numbers arrive as `+92 300 1234567`, `0300-1234567` and as a typed
 * Excel number that loses its leading zero. Rejecting any of those would be
 * inventing a format the company has never agreed on, so whatever is in the
 * cell is what is stored.
 */
describe('the phone column', () => {
  it('reads a number the sheet carries', () => {
    const { accepted } = validate([row({ [PHONE_COLUMN]: '+92 300 1234567' })]);

    expect(accepted[0].phone).toBe('+92 300 1234567');
  });

  it('leaves it empty rather than outstanding when the cell is blank', () => {
    // Unlike a team or a shift, this is genuinely optional: `S-08` step 2 must
    // not hold the commit open waiting for a number nobody has.
    const { accepted } = validate([row()]);

    expect(accepted[0].phone).toBe('');
  });

  it('keeps a number Excel typed as one, leading zero and all', () => {
    // A typed cell arrives as 3001234567 with the zero gone. Storing the
    // digits it does have beats rejecting a row over Excel's formatting.
    const { accepted } = validate([row({ [PHONE_COLUMN]: 3001234567 })]);

    expect(accepted[0].phone).toBe('3001234567');
  });

  it('never rejects a row over the phone number', () => {
    const { rejected } = validate([row({ [PHONE_COLUMN]: 'ext. 402' })]);

    expect(rejected).toHaveLength(0);
  });
});

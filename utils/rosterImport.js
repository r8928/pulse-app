/**
 * FR-2.9. The `Biometric ID` sheet, validated before anything is committed.
 *
 * Pure: it takes the parsed rows and the codes already in use, and returns
 * what would happen. Nothing here touches the database, so the whole of the
 * go-live migration's decision logic is testable without one.
 *
 * The sheet carries only a code and a name. Every other field `FR-2.6`
 * requires is **prompted for** rather than guessed — the import supplies no
 * default for team, employment type, tracked, login, date of joining or shift,
 * and the commit stays blocked until each is filled (`DC-6`).
 */

/**
 * What the sheet itself supplies, spelled exactly as the heading must read.
 *
 * `readSheetRows` keys each row on its trimmed heading, so a match is exact
 * and a sheet heading its name column anything else rejects every row at once
 * for want of a name. `S-08` shows these same two strings to the reader before
 * they choose a file, from here rather than from a copy, so the guidance
 * cannot drift from what is actually matched.
 */
export const EMPLOYEE_CODE_COLUMN = 'Employee Code';
export const EMPLOYEE_NAME_COLUMN = 'Employee Name';

/** Everything else is asked for afterwards. */
const SHEET_COLUMNS = [EMPLOYEE_CODE_COLUMN, EMPLOYEE_NAME_COLUMN];

/**
 * The fields the sheet does not carry. `S-08` step 2 lists every user against
 * every one of these that is still outstanding.
 */
export const REQUIRED_DETAILS = [
  'workEmail',
  'teamId',
  'employmentType',
  'tracked',
  'loginEnabled',
  'dateOfJoining',
  'shiftId',
];

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim();

/**
 * Validates the sheet against the codes already in use.
 *
 * `existingCodes` is a Set of every employee code in the system **including
 * soft-deleted users**, because `FR-2.6` makes the code unique across all of
 * them — a departed colleague's records must never be reattached to a new
 * joiner who happened to be given their code.
 */
export function validateRosterRows(rows, existingCodes) {
  const accepted = [];
  const rejected = [];
  const seen = new Map();

  rows.forEach((row, index) => {
    // The reader thinks in sheet rows, and row 1 is the header.
    const sheetRow = index + 2;
    const employeeCode = text(row[EMPLOYEE_CODE_COLUMN]);
    const fullName = text(row[EMPLOYEE_NAME_COLUMN]);

    if (!employeeCode) {
      rejected.push({
        sheetRow,
        employeeCode,
        fullName,
        reason:
          'No employee code. The code is the only thing that identifies a person; a name is never used to match.',
      });
      return;
    }

    if (!fullName) {
      rejected.push({
        sheetRow,
        employeeCode,
        fullName,
        reason: 'No name. Every user record needs one.',
      });
      return;
    }

    if (existingCodes.has(employeeCode)) {
      rejected.push({
        sheetRow,
        employeeCode,
        fullName,
        reason: `Employee code ${employeeCode} already belongs to a user. Codes are unique across everyone, including colleagues who have left, so their records are never reattached to a new joiner.`,
      });
      return;
    }

    if (seen.has(employeeCode)) {
      rejected.push({
        sheetRow,
        employeeCode,
        fullName,
        reason: `Employee code ${employeeCode} appears twice in this sheet, first on row ${seen.get(employeeCode)}.`,
      });
      return;
    }

    seen.set(employeeCode, sheetRow);
    accepted.push({ sheetRow, employeeCode, fullName });
  });

  return { accepted, rejected };
}

/**
 * Which fields are still outstanding for each accepted row.
 *
 * A shift is required only for a tracked user (`FR-3.4`), and a work email is
 * genuinely optional (`FR-2.6`) — support staff hold none — so "not supplied"
 * is only a gap where the field is actually required. Everything else stays
 * outstanding until it is answered.
 */
export function outstandingDetails(row) {
  const missing = [];

  for (const field of REQUIRED_DETAILS) {
    if (field === 'workEmail') continue;

    // A shift is required for a tracked user and optional for an untracked one.
    if (field === 'shiftId' && row.tracked === false) continue;

    const value = row[field];
    // False is an answer; undefined and null are not.
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }

  return missing;
}

/** The commit stays disabled until every accepted row is complete (`FR-2.9`). */
export function readyToCommit(rows) {
  return (
    rows.length > 0 && rows.every((row) => outstandingDetails(row).length === 0)
  );
}

export { SHEET_COLUMNS };

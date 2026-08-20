import { isValid, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { ROLES } from '../constants/index.js';

/**
 * FR-2.9. The `Biometric ID` sheet, validated before anything is committed.
 *
 * Pure: it takes the parsed rows and the codes already in use, and returns
 * what would happen. Nothing here touches the database, so the whole of the
 * go-live migration's decision logic is testable without one.
 *
 * Two columns identify a person and are required. The rest carry the `FR-2.6`
 * fields the create-user form takes, and each is optional in the same sense
 * the form's fields are answered one at a time: a blank cell is not an error,
 * it just leaves the field outstanding for `S-08` step 2 to ask about.
 *
 * What is never done is guessing. A cell that is filled in but unreadable
 * rejects the row and says why, rather than falling back to a default —
 * a mistyped role quietly becoming EMPLOYEE is how somebody ends up with the
 * wrong access (`DC-6`). Team and shift stay off the sheet entirely: `FR-2.1`
 * makes each its own operation, and neither is on the create-user form.
 */

/** The sheet the upload looks for, and the one the template hands out. */
export const SHEET_NAME = 'Biometric ID';

/**
 * Spelled exactly as each heading must read.
 *
 * `readSheetRows` keys each row on its trimmed heading, so a match is exact
 * and a sheet heading its name column anything else rejects every row at once
 * for want of a name. `S-08`'s guide and the blank template are both built
 * from these, so neither can drift from what is actually matched.
 */
export const EMPLOYEE_CODE_COLUMN = 'Employee Code';
export const EMPLOYEE_NAME_COLUMN = 'Employee Name';
export const WORK_EMAIL_COLUMN = 'Work Email';
export const EMPLOYMENT_TYPE_COLUMN = 'Employment Type';
export const ROLE_COLUMN = 'Role';
export const DATE_OF_JOINING_COLUMN = 'Date of Joining';
export const TRACKED_COLUMN = 'Attendance Tracked';
export const LOGIN_ENABLED_COLUMN = 'Login Enabled';

/**
 * The sheet's shape, in the order the columns appear.
 *
 * One list drives three things — the parser, the guide `S-08` shows before a
 * file is chosen, and the blank template it hands out — so a column added here
 * appears in all three or in none.
 */
export const SHEET_COLUMNS = Object.freeze([
  {
    name: EMPLOYEE_CODE_COLUMN,
    required: true,
    example: 'CB-1042',
    note: 'The code the biometric machine reports. Unique across everyone, including colleagues who have left.',
  },
  {
    name: EMPLOYEE_NAME_COLUMN,
    required: true,
    example: 'Sana Iqbal',
    note: 'Never used to match a person — only the code is.',
  },
  {
    name: WORK_EMAIL_COLUMN,
    required: false,
    example: 'sana@citrusbits.com',
    note: 'Optional even when filled in elsewhere: support staff hold none and never sign in.',
  },
  {
    name: EMPLOYMENT_TYPE_COLUMN,
    required: false,
    example: 'PERMANENT',
    note: 'One of the types the company has configured. Case does not matter.',
  },
  {
    name: ROLE_COLUMN,
    required: false,
    example: 'EMPLOYEE',
    note: `One of ${Object.values(ROLES).join(', ')}. Left blank, it is asked for as EMPLOYEE.`,
  },
  {
    name: DATE_OF_JOINING_COLUMN,
    required: false,
    example: '2024-03-11',
    note: 'A real date cell, or text as YYYY-MM-DD. Opens their first tenure.',
  },
  {
    name: TRACKED_COLUMN,
    required: false,
    example: 'TRUE',
    note: 'TRUE or FALSE. Whether attendance is recorded for them at all.',
  },
  {
    name: LOGIN_ENABLED_COLUMN,
    required: false,
    example: 'FALSE',
    note: 'TRUE or FALSE. Whether they may sign in, if they hold a work email.',
  },
]);

/**
 * Two example people, invented, for the guide `S-08` shows before a file is
 * chosen. Nobody should read a real colleague into an example, and the pair
 * between them shows every column both filled and left blank — a support-staff
 * row genuinely has no email and never signs in.
 *
 * The first row is `SHEET_COLUMNS`' own examples, so it cannot drift from the
 * glossary printed beneath it.
 */
export const SHEET_EXAMPLE_ROWS = Object.freeze([
  SHEET_COLUMNS.map((column) => column.example),
  Object.freeze([
    'CB-1043',
    'Daniyal Khan',
    '',
    'SUPPORT_STAFF',
    'EMPLOYEE',
    '2022-04-04',
    'TRUE',
    'FALSE',
  ]),
]);

/** What the guide says about the sheet as a whole, beyond the columns. */
export const SHEET_NOTES = Object.freeze([
  'Every heading must match character for character. Anything else in that cell leaves the column unread, and every row is rejected for the field it was carrying.',
  'Only the first two columns are required. Leave any other cell empty and the next step asks for it, one person at a time.',
  'A cell that is filled in but unreadable rejects that row and says why. Nothing is ever substituted for it — a mistyped role must not quietly become the wrong access.',
  'Team and shift are not on the sheet. Each is its own operation with its own history, so the next step asks for both.',
  'Any further column is ignored, not rejected. Leave the rest of the old workbook in place if it is easier.',
]);

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

/**
 * A cell as a person would read it.
 *
 * ExcelJS hands back more than strings: a typed address becomes a hyperlink
 * object, formatted text becomes rich text, and a formula becomes its own
 * shape carrying a result. Each of those reaching a validator as `[object
 * Object]` would reject a row whose cell looks perfectly fine on screen.
 */
const text = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((run) => run.text ?? '')
        .join('')
        .trim();
    }
    if (value.result !== undefined && value.result !== null) {
      return text(value.result);
    }
    return '';
  }

  return String(value).trim();
};

/** The value a cell holds behind any wrapper, for the cases that are typed. */
const raw = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !(value instanceof Date) &&
  value.result !== undefined
    ? value.result
    : value;

/** Blank stays blank; anything unreadable is reported, never substituted. */
const BLANK = { value: null };
const problem = (message) => ({ problem: message });

const readEmail = (cell) => {
  const value = text(cell).replace(/^mailto:/i, '');
  if (!value) return BLANK;

  // Deliberately loose. `userInputSchema` is the authority at commit; this
  // only catches what is plainly not an address, before the reader has filled
  // in a screenful of other answers.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return problem(
      `${WORK_EMAIL_COLUMN} reads "${value}", which is not an email address. Leave the cell empty if they have none.`,
    );
  }

  return { value };
};

const readEmploymentType = (cell, employmentTypes) => {
  const value = text(cell);
  if (!value) return BLANK;

  const match = employmentTypes.find(
    (type) => type.toLowerCase() === value.toLowerCase(),
  );

  if (!match) {
    return problem(
      `${EMPLOYMENT_TYPE_COLUMN} reads "${value}", which is not a type this company has. The types are: ${employmentTypes.join(', ')}.`,
    );
  }

  // Case is normalised to the configured name, which is not a guess: the name
  // is the natural key, and two types differing only in case cannot coexist.
  return { value: match };
};

const readRole = (cell) => {
  const value = text(cell);
  if (!value) return BLANK;

  const match = Object.values(ROLES).find(
    (role) => role.toLowerCase() === value.toLowerCase(),
  );

  if (!match) {
    return problem(
      `${ROLE_COLUMN} reads "${value}", which is not one of ${Object.values(ROLES).join(', ')}.`,
    );
  }

  return { value: match };
};

/**
 * A date cell, or text already unambiguous.
 *
 * A real Excel date is read in UTC, which is how ExcelJS produces it — reading
 * it locally would move a joining date a day in either direction depending on
 * where the browser is.
 *
 * Written dates are accepted only as YYYY-MM-DD. `03/04/2024` is two different
 * days either side of the Atlantic, and picking one would be exactly the guess
 * this screen refuses to make.
 */
const readDate = (cell) => {
  const value = raw(cell);

  if (value instanceof Date) {
    return { value: formatInTimeZone(value, 'UTC', 'yyyy-MM-dd') };
  }

  const written = text(value);
  if (!written) return BLANK;

  if (/^\d{4}-\d{2}-\d{2}$/.test(written) && isValid(parseISO(written))) {
    return { value: written };
  }

  return problem(
    `${DATE_OF_JOINING_COLUMN} reads "${written}", which could be more than one day. Format the column as a date in Excel, or write it as YYYY-MM-DD.`,
  );
};

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

const readBoolean = (cell, column) => {
  const value = raw(cell);
  if (typeof value === 'boolean') return { value };

  const written = text(value);
  if (!written) return BLANK;

  const word = written.toLowerCase();
  if (TRUE_WORDS.has(word)) return { value: true };
  if (FALSE_WORDS.has(word)) return { value: false };

  return problem(
    `${column} reads "${written}". Write TRUE or FALSE, or leave the cell empty to be asked at the next step.`,
  );
};

/**
 * Validates the sheet against the codes already in use.
 *
 * `existingCodes` is a Set of every employee code in the system **including
 * soft-deleted users**, because `FR-2.6` makes the code unique across all of
 * them — a departed colleague's records must never be reattached to a new
 * joiner who happened to be given their code.
 *
 * `employmentTypes` is the company's configured list, so a type the sheet
 * names can be checked against one that exists rather than invented on import.
 */
export function validateRosterRows(
  rows,
  existingCodes,
  { employmentTypes = [] } = {},
) {
  const accepted = [];
  const rejected = [];
  const seen = new Map();

  rows.forEach((row, index) => {
    // The reader thinks in sheet rows, and row 1 is the header.
    const sheetRow = index + 2;
    const employeeCode = text(row[EMPLOYEE_CODE_COLUMN]);
    const fullName = text(row[EMPLOYEE_NAME_COLUMN]);
    const reject = (reason) =>
      rejected.push({ sheetRow, employeeCode, fullName, reason });

    if (!employeeCode) {
      reject(
        'No employee code. The code is the only thing that identifies a person; a name is never used to match.',
      );
      return;
    }

    if (!fullName) {
      reject('No name. Every user record needs one.');
      return;
    }

    if (existingCodes.has(employeeCode)) {
      reject(
        `Employee code ${employeeCode} already belongs to a user. Codes are unique across everyone, including colleagues who have left, so their records are never reattached to a new joiner.`,
      );
      return;
    }

    if (seen.has(employeeCode)) {
      reject(
        `Employee code ${employeeCode} appears twice in this sheet, first on row ${seen.get(employeeCode)}.`,
      );
      return;
    }

    const details = {
      workEmail: readEmail(row[WORK_EMAIL_COLUMN]),
      employmentType: readEmploymentType(
        row[EMPLOYMENT_TYPE_COLUMN],
        employmentTypes,
      ),
      role: readRole(row[ROLE_COLUMN]),
      dateOfJoining: readDate(row[DATE_OF_JOINING_COLUMN]),
      tracked: readBoolean(row[TRACKED_COLUMN], TRACKED_COLUMN),
      loginEnabled: readBoolean(
        row[LOGIN_ENABLED_COLUMN],
        LOGIN_ENABLED_COLUMN,
      ),
    };

    // One reason at a time, and the leftmost column first: a reader fixing the
    // sheet works left to right, and six complaints about one row is a wall.
    const unreadable = Object.values(details).find((read) => read.problem);

    if (unreadable) {
      reject(unreadable.problem);
      return;
    }

    seen.set(employeeCode, sheetRow);
    accepted.push({
      sheetRow,
      employeeCode,
      fullName,
      // Text fields answer with '' so the step 2 field can hold them directly;
      // the tri-state ones answer with null, which means "not stated" and
      // leaves the create-user form's own default to stand.
      workEmail: details.workEmail.value ?? '',
      employmentType: details.employmentType.value ?? '',
      dateOfJoining: details.dateOfJoining.value ?? '',
      role: details.role.value,
      tracked: details.tracked.value,
      loginEnabled: details.loginEnabled.value,
    });
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

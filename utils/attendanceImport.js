import { format, isValid, parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { PUNCH_TYPE } from '../constants/index.js';
import { isWithinEmploymentPeriod } from './employment.js';

/**
 * FR-4.2 to FR-4.5 and FR-4.11. The biometric export, validated before
 * anything is committed.
 *
 * Pure: it takes the parsed rows and the users already known, and returns what
 * would happen. Nothing here touches the database — which is what lets NFR-4's
 * 40,000 rows validate in one in-memory pass against a bulk-loaded map rather
 * than one query per row.
 *
 * FR-4.3: `Employee Code` is the ONLY match key. `Employee Name` is carried
 * through for the reader — so a rejection names the person it is about — and
 * is never compared against anything.
 */

/**
 * FR-4.11: the format is confirmed by a person before validation runs, because
 * `03/04/2026` is a different day under two of these and the system must not
 * pick one. A row that cannot be read unambiguously under the confirmed format
 * is rejected with that as the stated reason.
 */
export const DATE_FORMATS = Object.freeze({
  DMY: { value: 'DMY', label: 'DD/MM/YYYY — day first', pattern: 'dd/MM/yyyy' },
  MDY: {
    value: 'MDY',
    label: 'MM/DD/YYYY — month first',
    pattern: 'MM/dd/yyyy',
  },
  ISO: { value: 'ISO', label: 'YYYY-MM-DD — ISO', pattern: 'yyyy-MM-dd' },
});

/**
 * The sheet the template hands out, and the one the upload looks for first.
 *
 * A terminal export rarely names its sheet, so `readSheetRows` falls back to
 * the first worksheet in the book. Naming one here only makes the template
 * self-describing; it never makes an existing export unreadable.
 */
export const ATTENDANCE_SHEET_NAME = 'Punches';

/**
 * Spelled exactly as each heading must read.
 *
 * `readSheetRows` keys each row on its trimmed heading, so a match is exact: a
 * sheet heading its code column anything else rejects every row at once for
 * want of a code. The parser below, `S-11`'s format guide and the blank
 * template are all built from these, so none of the three can drift.
 */
export const EMPLOYEE_CODE_COLUMN = 'Employee Code';
export const EMPLOYEE_NAME_COLUMN = 'Employee Name';
export const TYPE_COLUMN = 'Type';
export const DATE_COLUMN = 'Date';
export const TIME_COLUMN = 'Time';

/**
 * The sheet's shape, in the order the columns appear.
 *
 * `Sr No.` is carried deliberately even though nothing reads it: it is the
 * first column of the export the terminal actually produces, and a template
 * that omitted it would have people deleting a column before they could use
 * theirs.
 */
export const ATTENDANCE_SHEET_COLUMNS = Object.freeze([
  {
    name: 'Sr No.',
    required: false,
    example: '1',
    note: 'Whatever the terminal numbered the row. Read by nobody, kept so the export can be uploaded exactly as it came.',
  },
  {
    name: EMPLOYEE_CODE_COLUMN,
    required: true,
    example: 'CB-1042',
    note: 'The code the biometric machine reports. The only thing used to match a person, and it must already belong to a tracked user.',
  },
  {
    name: EMPLOYEE_NAME_COLUMN,
    required: false,
    example: 'Sana Iqbal',
    note: 'Shown beside a rejected row so you can find it in the sheet. Never compared against anything, and never allowed to change a stored name.',
  },
  {
    name: TYPE_COLUMN,
    required: true,
    example: 'Check In',
    note: 'The direction of the punch. Check In, Check Out, In, Out, CheckIn and CHECK_OUT all read; anything else rejects the row.',
  },
  {
    name: DATE_COLUMN,
    required: true,
    example: '03/04/2026',
    note: 'A real date cell, or text in the one format you confirm at step 2. Every row in the sheet must use that same format.',
  },
  {
    name: TIME_COLUMN,
    required: true,
    example: '09:12',
    note: 'A 24-hour clock time: HH:MM or HH:MM:SS. Read in the punching user’s own timezone.',
  },
]);

/**
 * Two example punches, invented — a check in and the check out that closes it,
 * so the pair shows what one worked day looks like in the sheet.
 */
export const ATTENDANCE_EXAMPLE_ROWS = Object.freeze([
  ATTENDANCE_SHEET_COLUMNS.map((column) => column.example),
  Object.freeze([
    '2',
    'CB-1042',
    'Sana Iqbal',
    'Check Out',
    '03/04/2026',
    '18:04',
  ]),
]);

/** What the guide says about the sheet as a whole, beyond the columns. */
export const ATTENDANCE_SHEET_NOTES = Object.freeze([
  'Every heading must match character for character. Anything else in that cell leaves the column unread, and every row is rejected for the field it was carrying.',
  'One row is one punch, not one day. A person who came in and left again has two rows, and each is matched to a check in or a check out by its Type.',
  'The whole sheet is read under a single date format, confirmed by you at step 2. 03/04/2026 is two different days and Pulse will not pick one.',
  'A code that matches nobody, an untracked person, or a date outside their employment period rejects that row with the reason stated. The rest of the sheet still imports.',
  'Nothing is written until you have seen the preview. Then every accepted row is written or none is.',
  'Any further column is ignored, not rejected. Leave the rest of the terminal’s export in place.',
]);

const PATTERNS = Object.fromEntries(
  Object.values(DATE_FORMATS).map((entry) => [entry.value, entry.pattern]),
);

const TIME_PATTERNS = ['HH:mm:ss', 'HH:mm', 'H:mm'];

/**
 * `parse` fills any field the pattern does not mention from a reference date.
 * Every pattern here specifies the whole date or the whole time, so the
 * reference never reaches the result — the epoch is used rather than `now` so
 * the function stays deterministic (§23.5, NFR-8).
 */
const REFERENCE = new Date(0);

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim();

/** Both directions, however the terminal spelled them. */
const TYPES = new Map([
  ['CHECK IN', PUNCH_TYPE.CHECK_IN],
  ['CHECKIN', PUNCH_TYPE.CHECK_IN],
  ['CHECK_IN', PUNCH_TYPE.CHECK_IN],
  ['IN', PUNCH_TYPE.CHECK_IN],
  ['CHECK OUT', PUNCH_TYPE.CHECK_OUT],
  ['CHECKOUT', PUNCH_TYPE.CHECK_OUT],
  ['CHECK_OUT', PUNCH_TYPE.CHECK_OUT],
  ['OUT', PUNCH_TYPE.CHECK_OUT],
]);

/**
 * A spreadsheet cell may arrive as text or, where the sheet formatted it, as a
 * real date. Both are read; anything else is rejected rather than coerced.
 */
function readDate(value, dateFormat) {
  if (value instanceof Date) {
    return isValid(value) ? format(value, 'yyyy-MM-dd') : null;
  }

  const raw = text(value);
  if (!raw) return null;

  const parsed = parse(raw, PATTERNS[dateFormat], REFERENCE);
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : null;
}

function readTime(value) {
  if (value instanceof Date) {
    return isValid(value) ? format(value, 'HH:mm') : null;
  }

  const raw = text(value);
  if (!raw) return null;

  for (const pattern of TIME_PATTERNS) {
    const parsed = parse(raw, pattern, REFERENCE);
    if (isValid(parsed)) return format(parsed, 'HH:mm');
  }

  return null;
}

/**
 * @param {Array<object>} rows the sheet's data rows, header already removed
 * @param {{ usersByCode: Map<string, object>, dateFormat: string }} context
 * @returns {{ accepted: Array<object>, rejected: Array<object> }}
 */
export function validateAttendanceRows(rows, { usersByCode, dateFormat }) {
  const accepted = [];
  const rejected = [];

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

    const user = usersByCode.get(employeeCode);

    if (!user) {
      reject(
        `Employee code ${employeeCode} matches no user. Add the person first, or correct the code in the sheet.`,
      );
      return;
    }

    if (!user.tracked) {
      reject(
        `${user.fullName} is not tracked, so no attendance is recorded for them.`,
      );
      return;
    }

    const type = TYPES.get(text(row[TYPE_COLUMN]).toUpperCase());

    if (!type) {
      reject(
        `“${text(row[TYPE_COLUMN])}” is not a check in or check out, so there is nothing to record.`,
      );
      return;
    }

    const date = readDate(row[DATE_COLUMN], dateFormat);

    if (!date) {
      reject(
        `The date “${text(row[DATE_COLUMN])}” could not be read as ${DATE_FORMATS[dateFormat]?.label ?? dateFormat}.`,
      );
      return;
    }

    const time = readTime(row[TIME_COLUMN]);

    if (!time) {
      reject(`The time “${text(row[TIME_COLUMN])}” could not be read.`);
      return;
    }

    // FR-2.12: dates in a tenure gap carry no record, so a punch cannot land
    // on one.
    if (!isWithinEmploymentPeriod(user.tenures, date)) {
      reject(
        `${date} is outside ${user.fullName}'s employment period, so no attendance can be recorded on it.`,
      );
      return;
    }

    accepted.push({
      sheetRow,
      employeeCode,
      userId: String(user._id),
      // The STORED name, not the sheet's. FR-4.3: the sheet's name is shown to
      // the reader and never allowed to change anything.
      fullName: user.fullName,
      type,
      at: fromZonedTime(`${date}T${time}`, user.timezone).toISOString(),
    });
  });

  return { accepted, rejected };
}

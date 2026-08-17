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
    const employeeCode = text(row['Employee Code']);
    const fullName = text(row['Employee Name']);

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

    const type = TYPES.get(text(row.Type).toUpperCase());

    if (!type) {
      reject(
        `“${text(row.Type)}” is not a check in or check out, so there is nothing to record.`,
      );
      return;
    }

    const date = readDate(row.Date, dateFormat);

    if (!date) {
      reject(
        `The date “${text(row.Date)}” could not be read as ${DATE_FORMATS[dateFormat]?.label ?? dateFormat}.`,
      );
      return;
    }

    const time = readTime(row.Time);

    if (!time) {
      reject(`The time “${text(row.Time)}” could not be read.`);
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

import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { LEDGER_ENTRY_TYPE } from '../constants/index.js';
import {
  listDayRecords,
  listLeaveRecords,
  listLedgerEntriesForUsers,
  listShiftsByIds,
  listTenuresForUsers,
  listUsersByIds,
  summarisePunchDays,
} from '../database.js';
import { isWithinEmploymentPeriod } from '../utils/employment.js';
import { WFH_LEAVE_TYPE } from './ledger.js';

/**
 * Page 2's day-by-day view: one block per colleague, one row per date.
 *
 * Continuous by construction. Every date in the range gets a row whether or
 * not anything was recorded on it, because the reader is looking for the gaps
 * — and a view assembled only from the records that exist cannot show one. It
 * is the same lesson as workbook defect `F1`, one level down: a date with
 * nothing on it is a fact, not an absence of one.
 *
 * Five batched reads for the whole roster, never one per colleague. `NFR-3`
 * puts a full-company month under two seconds at p95, and a month of a team is
 * exactly the shape this screen opens on.
 */
export async function buildDayByDay({ userIds, from, to }) {
  if (!userIds || userIds.length === 0) return [];

  const [people, dayRecords, punchDays, leaveRecords, ledger, tenuresByUser] =
    await Promise.all([
      listUsersByIds(userIds),
      listDayRecords({ userIds, from, to }),
      summarisePunchDays({ userIds, from, to }),
      listLeaveRecords({ userIds, from, to }),
      // Everything up to the closing date, not only the range: a balance is a
      // total up to a date rather than a slice of one (§19.2), so the first
      // row of the range has to open on what came before it.
      listLedgerEntriesForUsers({ userIds, to }),
      listTenuresForUsers(userIds),
    ]);

  /**
   * §7.2: an instant is stored in UTC and READ in the timezone of the shift it
   * belongs to. The shift the DAY RECORD names, not the user's current one —
   * a colleague who moved shift mid-month has punches that belong to both.
   */
  const timezoneByShift = new Map(
    (await listShiftsByIds(dayRecords.map((record) => record.shiftId))).map(
      (shift) => [String(shift._id), shift.timezone],
    ),
  );

  const dates = eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  }).map((day) => format(day, 'yyyy-MM-dd'));

  const dayRecordsBy = keyByUserDate(dayRecords, (record) => record.date);
  const punchesBy = keyByUserDate(punchDays, (day) => day.date);
  const leaveBy = groupByUserDate(leaveRecords, (record) => record.date);
  const ledgerBy = groupByUser(ledger);

  return people
    .map((person) => {
      const userId = String(person._id);
      const balances = runningBalances(ledgerBy.get(userId) ?? [], dates);

      return {
        userId,
        fullName: person.fullName,
        employeeCode: person.employeeCode,
        noLongerActive: Boolean(person.deletedAt),
        days: dates.map((date) =>
          buildDay({
            date,
            dayRecord: dayRecordsBy.get(`${userId}|${date}`) ?? null,
            punchDay: punchesBy.get(`${userId}|${date}`) ?? null,
            leaveTaken: leaveBy.get(`${userId}|${date}`) ?? [],
            balance: balances.get(date),
            tenures: tenuresByUser.get(userId) ?? [],
            timezoneByShift,
          }),
        ),
      };
    })
    .sort((one, other) => one.fullName.localeCompare(other.fullName));
}

/**
 * One row.
 *
 * `override ?? computed` throughout: `FR-6.11` makes an administrator's
 * decision count exactly as the engine's own conclusion would, and a figure
 * read one way here and another way on the grid beside it is the drift
 * `NFR-8` exists to prevent.
 */
function buildDay({
  date,
  dayRecord,
  punchDay,
  leaveTaken,
  balance,
  tenures,
  timezoneByShift,
}) {
  const effective = (field) =>
    dayRecord?.override?.[field] ?? dayRecord?.computed?.[field] ?? null;

  return {
    date,
    weekday: format(parseISO(date), 'EEEE'),
    dayType: dayRecord?.dayType ?? null,
    dayStatus: effective('dayStatus'),
    // FR-4.8: a missing counterpart is an exception, never zero hours, so an
    // absent punch says nothing rather than saying midnight.
    checkIn: punchDay?.checkIn ? punchDay.checkIn.toISOString() : null,
    checkOut: punchDay?.checkOut ? punchDay.checkOut.toISOString() : null,
    workedMinutes: effective('workedMinutes') ?? 0,
    timezone: timezoneByShift.get(dayRecord?.shiftId) ?? null,
    leaveUsed: leaveTaken.reduce((total, record) => total + record.amount, 0),
    leaveAwarded: balance?.awarded ?? 0,
    leaveBalance: balance?.closing ?? 0,
    // FR-2.12: a date in a tenure gap carries no records at all. Marking it is
    // the difference between "did not work" and "did not work here".
    inEmploymentPeriod: isWithinEmploymentPeriod(tenures, date),
  };
}

/**
 * The balance after each date's movements, plus what was awarded on it.
 *
 * Accumulated in ledger order rather than re-summed per date: the entries
 * arrive oldest first, and running a total through them once is both the
 * cheaper answer and the same answer `S-14` shows for the same day.
 *
 * The WFH pseudo-type is left out. `D-13` makes it a count against a quota
 * rather than a pool drawn from a deposit, so adding it to a balance would
 * make the column mean two different things at once.
 */
function runningBalances(entries, dates) {
  const AWARDS = [
    LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT,
    LEDGER_ENTRY_TYPE.CTO_APPLIED,
    LEDGER_ENTRY_TYPE.PTO_AWARD,
  ];

  const closingByDate = new Map();
  const awardedByDate = new Map();
  let running = 0;

  for (const entry of entries) {
    if (entry.leaveType === WFH_LEAVE_TYPE) continue;

    running += entry.amount;
    closingByDate.set(entry.date, round(running));

    if (AWARDS.includes(entry.entryType)) {
      awardedByDate.set(
        entry.date,
        round((awardedByDate.get(entry.date) ?? 0) + entry.amount),
      );
    }
  }

  // A date with no movement of its own carries the last one forward, so every
  // row states a balance rather than leaving the reader to look upward for it.
  const balances = new Map();
  let carried = openingBefore(closingByDate, dates[0]);

  for (const date of dates) {
    if (closingByDate.has(date)) carried = closingByDate.get(date);
    balances.set(date, {
      closing: carried,
      awarded: awardedByDate.get(date) ?? 0,
    });
  }

  return balances;
}

/** The balance the range opens on: every movement strictly before its first date. */
function openingBefore(closingByDate, firstDate) {
  let opening = 0;

  for (const [date, closing] of closingByDate) {
    if (date < firstDate) opening = closing;
  }

  return opening;
}

const round = (value) => Math.round(value * 100) / 100;

const keyByUserDate = (rows, dateOf) =>
  new Map(rows.map((row) => [`${row.userId}|${dateOf(row)}`, row]));

function groupByUserDate(rows, dateOf) {
  const grouped = new Map();

  for (const row of rows) {
    const key = `${row.userId}|${dateOf(row)}`;
    const held = grouped.get(key);
    if (held) held.push(row);
    else grouped.set(key, [row]);
  }

  return grouped;
}

function groupByUser(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const held = grouped.get(row.userId);
    if (held) held.push(row);
    else grouped.set(row.userId, [row]);
  }

  return grouped;
}

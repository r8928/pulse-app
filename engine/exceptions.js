import { addDays, format, parseISO } from 'date-fns';
import {
  APPROVAL_STATUS,
  EXCEPTION_CODE,
  EXCEPTION_QUEUE,
} from '../constants/index.js';
import {
  getTeamConfiguration,
  getTeamPolicy,
  getUserById,
  listCtoApplications,
  listDayRecordExceptions,
  listDuplicatePunches,
  listImportExceptions,
  listPendingApprovals,
  listPtoAwards,
  listTeams,
  listTrackedUserIds,
  summariseBalances,
} from '../database.js';
import { effective } from '../utils/dayRecord.js';

/**
 * `FR-8.6` and §27.1's twelve queues, each answering `{ items, total }` so
 * `S-05` renders twelve tabs through one shape.
 *
 * §27.2 decides where each one reads from. **Derive, do not accumulate**: a
 * day-level exception is a conclusion about current state, so it is read live
 * and heals itself the moment the underlying record is fixed. Only the three
 * queues carrying a human decision — `FR-2.11`, PTO, CTO — read stored
 * records, plus the unmatched import row (`D-26`), which is a fact about a
 * file rather than a conclusion about a record.
 *
 * `NFR-3`, `DC-10`: every queue takes a page and returns the full total. The
 * backlog grows with the roster, so nothing here materialises it whole.
 */

const DEFAULT_WARNING_DAYS = 7;

const empty = { items: [], total: 0 };

/** Names on rows, resolved once per queue rather than once per row. */
async function withUserNames(rows) {
  const ids = [...new Set(rows.map((row) => row.userId))];
  const people = await Promise.all(ids.map((id) => getUserById(id)));
  const byId = new Map(
    people.filter(Boolean).map((person) => [String(person._id), person]),
  );

  return rows.map((row) => {
    const person = byId.get(row.userId);
    return {
      ...row,
      userName: person?.fullName ?? 'No longer on the roster',
      employeeCode: person?.employeeCode ?? '—',
      // FR-2.4: a departed colleague's exceptions still surface, marked.
      noLongerActive: Boolean(person?.deletedAt),
    };
  });
}

/** The three day-code queues, which differ only in which codes they match. */
const dayCodeQueue = (codes) => async (options) => {
  const { items, total } = await listDayRecordExceptions({ codes, ...options });

  return {
    items: await withUserNames(
      items.map((record) => ({
        id: String(record._id),
        userId: record.userId,
        date: record.date,
        codes: record.exceptions,
        version: record.version,
      })),
    ),
    total,
  };
};

/**
 * `FR-6.10`'s queue. "Unresolved" is the state the spec leaves undefined, so
 * it is settled here: a lateness that cost leave and that nobody has waived.
 * Waiving it (`P-25`) or cancelling it with CTO are the two things that
 * resolve it, and both work by moving the effective deduction to zero — which
 * is why this reads `effective` rather than `computed`.
 */
async function lateArrivalQueue(options) {
  const { items, total } = await listDayRecordExceptions({
    matchExtra: { 'computed.deduction': { $gt: 0 } },
    ...options,
  });

  const unresolved = items.filter(
    (record) =>
      (effective(record, 'lateMinutes') ?? 0) > 0 &&
      (effective(record, 'deduction') ?? 0) > 0,
  );

  return {
    items: await withUserNames(
      unresolved.map((record) => ({
        id: String(record._id),
        userId: record.userId,
        date: record.date,
        lateMinutes: effective(record, 'lateMinutes'),
        deduction: effective(record, 'deduction'),
        rule: effective(record, 'deductionRule'),
        version: record.version,
      })),
    ),
    // The waived ones are no longer outstanding, so they leave the count too.
    total: total - (items.length - unresolved.length),
  };
}

/** `FR-3.13`. One row per outstanding field, across every team. */
async function configurationQueue({ page = 1, pageSize = 25 } = {}) {
  const teams = await listTeams({ includeDeleted: false });

  const rows = [];
  for (const team of teams.items) {
    const configuration = await getTeamConfiguration(String(team._id));
    for (const gap of configuration?.gaps ?? []) {
      rows.push({
        id: `${team._id}:${gap.field}`,
        teamId: String(team._id),
        teamName: team.name,
        ...gap,
      });
    }
  }

  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
  };
}

/**
 * `FR-8.6`'s "exhausted leave or PTO balance". Below zero is the only reading
 * that needs no threshold nobody has specified — the balance is spent and the
 * next deduction is already going further into the red.
 */
async function exhaustedBalanceQueue({ from, to, page = 1, pageSize = 25 }) {
  const userIds = await listTrackedUserIds();
  if (userIds.length === 0) return empty;

  const { rows } = await summariseBalances({ userIds, from, to });
  const negative = rows.filter((row) => row.balance < 0);

  return {
    items: await withUserNames(
      negative.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
        id: `${row.userId}:${row.leaveType}`,
        userId: row.userId,
        leaveType: row.leaveType,
        balance: row.balance,
      })),
    ),
    total: negative.length,
  };
}

/**
 * `FR-7.4`, `D-27`. Approved, not yet expired, and expiring within the team's
 * `ptoExpiryWarningDays` — so nothing is silently lost.
 */
async function expiringPtoQueue({ page = 1, pageSize = 25 } = {}) {
  const awards = await listPtoAwards({ status: APPROVAL_STATUS.APPROVED });
  const today = format(new Date(), 'yyyy-MM-dd');

  const warned = [];
  for (const award of awards) {
    if (!award.expiresAt || award.expiresAt < today) continue;

    const user = await getUserById(award.userId);
    const policy = user?.teamId ? await getTeamPolicy(user.teamId) : null;
    const windowEnd = format(
      addDays(
        parseISO(today),
        policy?.ptoExpiryWarningDays ?? DEFAULT_WARNING_DAYS,
      ),
      'yyyy-MM-dd',
    );

    if (award.expiresAt <= windowEnd) {
      warned.push({
        id: String(award._id),
        userId: award.userId,
        date: award.date,
        expiresAt: award.expiresAt,
        amount: award.approvedAmount,
        version: award.version,
      });
    }
  }

  return {
    items: await withUserNames(
      warned.slice((page - 1) * pageSize, page * pageSize),
    ),
    total: warned.length,
  };
}

/** The two candidate queues, which differ only in which collection they read. */
const candidateQueue =
  (list, amountField) =>
  async ({ page = 1, pageSize = 25 } = {}) => {
    const all = await list({ status: APPROVAL_STATUS.PENDING });

    return {
      items: await withUserNames(
        all.slice((page - 1) * pageSize, page * pageSize).map((candidate) => ({
          id: String(candidate._id),
          userId: candidate.userId,
          date: candidate.date,
          rule: candidate.rule,
          [amountField]: candidate.proposedAmount,
          version: candidate.version,
        })),
      ),
      total: all.length,
    };
  };

/** `D-26`. Nothing to approve or decline — only to acknowledge. */
async function importRowQueue({ page = 1, pageSize = 25 } = {}) {
  const { items, total } = await listImportExceptions({ page, pageSize });

  return {
    items: items.map((row) => ({
      id: String(row._id),
      sheetRow: row.sheetRow,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      reason: row.reason,
      importedAt: row.importedAt,
    })),
    total,
  };
}

/** `FR-2.11`, with the change that caused it and the records at stake. */
async function reductionQueue({ page = 1, pageSize = 25 } = {}) {
  const all = await listPendingApprovals();

  return {
    items: all
      .slice((page - 1) * pageSize, page * pageSize)
      .map((approval) => ({
        id: String(approval._id),
        userId: approval.userId,
        userName: approval.userName,
        change: approval.change,
        records: approval.records,
        raisedAt: approval.raisedAt,
        version: approval.version,
      })),
    total: all.length,
  };
}

const QUEUES = Object.freeze({
  [EXCEPTION_QUEUE.MISSING_PUNCH]: dayCodeQueue([
    EXCEPTION_CODE.MISSING_CHECK_IN,
    EXCEPTION_CODE.MISSING_CHECK_OUT,
  ]),
  [EXCEPTION_QUEUE.IMPOSSIBLE_DURATION]: dayCodeQueue([
    EXCEPTION_CODE.IMPOSSIBLE_DURATION,
  ]),
  [EXCEPTION_QUEUE.NO_SHIFT]: dayCodeQueue([EXCEPTION_CODE.NO_SHIFT_ASSIGNED]),
  [EXCEPTION_QUEUE.DUPLICATE_PUNCH]: async (options) => {
    const { items, total } = await listDuplicatePunches(options);
    return {
      items: await withUserNames(
        items.map((punch) => ({
          id: String(punch._id),
          userId: punch.userId,
          date: punch.workDate,
          at: punch.at,
          type: punch.type,
          version: punch.version,
        })),
      ),
      total,
    };
  },
  [EXCEPTION_QUEUE.CONFIGURATION]: configurationQueue,
  [EXCEPTION_QUEUE.IMPORT_ROW]: importRowQueue,
  [EXCEPTION_QUEUE.LATE_ARRIVAL]: lateArrivalQueue,
  [EXCEPTION_QUEUE.EXHAUSTED_BALANCE]: exhaustedBalanceQueue,
  [EXCEPTION_QUEUE.PTO_EXPIRING]: expiringPtoQueue,
  [EXCEPTION_QUEUE.PTO_PENDING]: candidateQueue(
    listPtoAwards,
    'proposedAmount',
  ),
  [EXCEPTION_QUEUE.CTO_PENDING]: candidateQueue(
    listCtoApplications,
    'proposedAmount',
  ),
  [EXCEPTION_QUEUE.REDUCTION]: reductionQueue,
});

/**
 * One queue, paged. An unrecognised name answers empty rather than throwing:
 * `S-05` renders twelve tabs at once, and one bad name must not blank the
 * other eleven.
 */
export async function listExceptionQueue(queue, options = {}) {
  const read = QUEUES[queue];
  return read ? read(options) : empty;
}

/**
 * Every queue's count, for `S-05`'s tabs and `S-04`'s tiles.
 *
 * One failing queue yields a zero rather than taking the page down with it —
 * `S-04`'s error state is per tile for exactly this reason.
 */
export async function countExceptionQueues(options = {}) {
  const entries = await Promise.all(
    Object.keys(QUEUES).map(async (queue) => {
      try {
        const { total } = await listExceptionQueue(queue, {
          ...options,
          pageSize: 1,
        });
        return [queue, total];
      } catch {
        return [queue, 0];
      }
    }),
  );

  return Object.fromEntries(entries);
}

import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  format,
  parseISO,
  subDays,
} from 'date-fns';
import {
  DAY_STATUS,
  DAY_TYPE,
  EXCEPTION_CODE,
  PUNCH_TYPE,
} from '../constants/index.js';
import {
  activityDateRange,
  listLedgerEntriesForSource,
  listPunchesInInstantRange,
  listTrackedUserIds,
  loadRecalculationInputs,
  postLedgerEntries,
  resolveTeamOnDate,
  reverseLedgerEntries,
  setPunchDerivedFields,
  upsertDayRecord,
} from '../database.js';
import { isWithinEmploymentPeriod } from '../utils/employment.js';
import { leaveYearsTouchedBy } from './accrual.js';
import { resolveDayStatus, resolveDayType } from './classify.js';
import {
  flagDuplicates,
  impossibleDurationExceptions,
  pairPunches,
  workedMinutes as sumWorkedMinutes,
} from './duration.js';
import { ensureEntitlementCredited } from './entitlement.js';
import { deductionFor } from './ladders.js';
import { desiredEntriesForDay, reconcileLedger } from './ledger.js';
import {
  clockedPercent,
  earlyMinutes,
  effectiveRequirement,
  isCompliant,
  isShortDay,
  lateMinutes,
  latenessPercent,
} from './punctuality.js';
import { resolveWorkDate, shiftWindow } from './workDate.js';

/**
 * The single recalculation entry point (ARCHITECTURE 23.3, design record D-4).
 *
 * Every write that can change a number a user sees calls this, and it is the
 * only path that recomputes a day record. One code path cannot drift from a
 * second one, which is what `NFR-8` requires.
 *
 * It contains no calculation of its own. Every value comes from the pure
 * functions in this directory, every read and write from `database.js` — this
 * file is the orchestration between them, and that separation is what lets the
 * calculations be tested without a database at all (§8.2).
 *
 * It stays idempotent (`I-9`): a day whose conclusions have not changed is not
 * written, so its version does not move, so the `effectKey` of the entries it
 * implies does not change, so nothing double-posts (§19.3). And it never
 * discards a human decision (`I-6`) — `upsertDayRecord` rewrites `computed`
 * and does not touch `override`.
 *
 * `D-2`: synchronous and scoped. The caller bounds the date range; wide
 * fan-out is handled by warning before saving rather than by a queue. If that
 * decision is ever reversed, moving this behind a queue means changing its
 * callers, not its logic. Do not build both paths.
 *
 * @param {string|null} userId — whose days to recompute, or null for every
 *   tracked user, narrowed by `options.teamId` where the trigger belongs to
 *   one team (a calendar or policy edit — §23.4).
 * @param {{ from: string, to: string|null }} dateRange — inclusive calendar
 *   dates as `YYYY-MM-DD`. A null `to` means "from that date forward", which is
 *   what a policy or team-move change produces (`FR-3.14`); it resolves to the
 *   last date that user has any activity on, because there is nothing to
 *   recompute beyond it.
 * @param {{
 *   teamId?: string|null,
 *   materialiseUsers?: string[],
 *   actor?: { userId: string, name: string },
 *   reason?: string,
 * }} [options] — `materialiseUsers` opts a bounded set of users into creating
 *   a record for an untouched date (`D-18`), which is what `S-10` passes when
 *   an OFFICE_ADMIN opens one team on one date.
 * @returns {Promise<{ recalculated: number }>} how many day records changed.
 */
export async function recalculateDays(userId, dateRange, options = {}) {
  const {
    teamId = null,
    materialiseUsers = [],
    actor = SYSTEM_ACTOR,
    reason = DEFAULT_REASON,
  } = options;

  const userIds = userId ? [userId] : await listTrackedUserIds({ teamId });

  let recalculated = 0;

  for (const id of userIds) {
    recalculated += await recalculateOneUser(id, dateRange, {
      materialise: materialiseUsers.includes(id),
      actor,
      reason,
    });
  }

  return { recalculated };
}

/**
 * A recalculation triggered by a policy or calendar edit has no single human
 * author for each movement it shifts, and inventing one would put a name
 * against a decision nobody made (FR-9.2). The route that owns a human action
 * passes its own actor.
 */
const SYSTEM_ACTOR = Object.freeze({ userId: 'system', name: 'Pulse engine' });

const DEFAULT_REASON = 'Recalculated after a change affecting this day';

/**
 * A night shift's punches sit either side of their work date, so the instants
 * loaded for re-resolution have to reach past the range at both ends (§13).
 */
const CROSSING_MARGIN_DAYS = 2;

async function recalculateOneUser(userId, { from, to }, context) {
  /**
   * An unbounded end — or an unbounded start, which a policy edit with no
   * effective date produces — is resolved from what the user actually has
   * recorded. Outside that span there is nothing to recompute, and D-18 would
   * materialise nothing there anyway.
   */
  const bounds =
    from === null || to === null || to === undefined
      ? await activityDateRange(userId)
      : { first: from, last: to };

  const resolvedFrom = from ?? bounds.first;
  const resolvedTo = to ?? bounds.last ?? resolvedFrom;

  if (!resolvedFrom || !resolvedTo || resolvedTo < resolvedFrom) return 0;

  const loadFrom = format(
    subDays(parseISO(resolvedFrom), CROSSING_MARGIN_DAYS),
    'yyyy-MM-dd',
  );
  const loadTo = format(
    addDays(parseISO(resolvedTo), CROSSING_MARGIN_DAYS),
    'yyyy-MM-dd',
  );

  const inputs = await loadRecalculationInputs(userId, {
    from: loadFrom,
    to: loadTo,
  });

  // FR-2.10: an untracked user receives no day records, so there is nothing
  // here to refresh — not an empty one, none at all.
  if (!inputs?.user.tracked || inputs.user.deletedAt) return 0;

  /**
   * D-12: no cron exists in this app, so a leave year credits itself the first
   * time anything looks at a date inside it. Before anything is computed, so
   * that a day which spends leave is measured against a balance that has
   * already been credited.
   */
  for (const year of leaveYearsTouchedBy({
    from: resolvedFrom,
    to: resolvedTo,
  })) {
    await ensureEntitlementCredited(userId, year, context.actor);
  }

  const punches = await resolveWorkDatesForPunches(userId, inputs, {
    loadFrom,
    loadTo,
  });

  const dates = datesToVisit(
    { from: resolvedFrom, to: resolvedTo },
    inputs,
    punches,
    context,
  );

  let changed = 0;
  for (const date of dates) {
    if (await recalculateOneDay(date, { userId, inputs, punches, context })) {
      changed += 1;
    }
  }

  return changed;
}

/**
 * §23.3 step 3. A shift assignment that changed moves the work date of punches
 * already stored, so they are re-resolved before anything is paired — a punch
 * left on its old date would be counted against a day it no longer belongs to.
 *
 * Returns the punches with their work dates as they now stand, so the caller
 * reads the fresh value rather than the stale stored one.
 */
async function resolveWorkDatesForPunches(
  userId,
  inputs,
  { loadFrom, loadTo },
) {
  const stored = await listPunchesInInstantRange(
    userId,
    parseISO(loadFrom),
    endOfDay(parseISO(loadTo)),
  );

  const resolved = [];

  for (const punch of stored) {
    const { workDate, exceptionCode } = resolveWorkDate(
      punch.at,
      inputs.shiftAssignments,
    );

    if (
      punch.workDate !== workDate ||
      punch.workDateExceptionCode !== exceptionCode
    ) {
      await setPunchDerivedFields(String(punch._id), {
        workDate,
        workDateExceptionCode: exceptionCode,
        isDuplicate: punch.isDuplicate ?? false,
      });
    }

    resolved.push({ ...punch, workDate, workDateExceptionCode: exceptionCode });
  }

  return resolved;
}

/**
 * D-18. A range recalculation is not by itself a reason to mint a day record:
 * a policy edit covering a year must not create 365 ABSENT rows per user. Only
 * dates something has actually touched are visited, unless the caller has
 * explicitly asked for a bounded set to be materialised (`S-10` opening one
 * team on one date).
 *
 * FR-2.12: a date in a tenure gap carries no day record at all, whichever way
 * it was reached.
 */
function datesToVisit({ from, to }, inputs, punches, context) {
  const recordDates = new Set(inputs.dayRecords.map((record) => record.date));
  const leaveDates = new Set(inputs.leaveRecords.map((record) => record.date));
  const punchDates = new Set(
    punches.filter((punch) => punch.workDate).map((punch) => punch.workDate),
  );

  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })
    .map((day) => format(day, 'yyyy-MM-dd'))
    .filter((date) => isWithinEmploymentPeriod(inputs.tenures, date))
    .filter(
      (date) =>
        context.materialise ||
        recordDates.has(date) ||
        leaveDates.has(date) ||
        punchDates.has(date),
    );
}

/**
 * §18.1 and FR-7.6: name the rule that produced the deduction, so S-12 and
 * S-14 can show why the number is what it is (NFR-11).
 *
 * The row is located in that team's own ladder rather than named from a
 * constant, because the ladder is per-team configuration and a second team may
 * have entirely different bands (I-3).
 */
function deductionRuleFor(ladder, deduction, attended) {
  if (deduction === 0) return null;
  if (!attended) return 'BR-9:did-not-attend';

  const index = ladder.findIndex(
    (row) => !row.didNotAttend && row.deduction === deduction,
  );

  return index === -1 ? 'BR-9' : `BR-9:band${index + 1}`;
}

const firstOfType = (punches, type) =>
  punches.find((punch) => punch.type === type) ?? null;

const lastOfType = (punches, type) =>
  [...punches].reverse().find((punch) => punch.type === type) ?? null;

/**
 * The pipeline of §12, for one user on one date. Every numbered step is one of
 * Branch 1's pure functions; this decides only what to feed them and what to
 * do with the answer.
 */
async function recalculateOneDay(date, { userId, inputs, punches, context }) {
  const exceptions = [];

  // 1. The team and shift held ON THIS DATE, never the current ones.
  const teamId = resolveTeamOnDate(
    inputs.teamAssignments,
    date,
    inputs.user.teamId,
  );
  const policy = inputs.policyByTeam[teamId] ?? {};
  const assignment = inputs.shiftAssignments.find(
    (candidate) =>
      candidate.effectiveFrom <= date &&
      (candidate.effectiveTo === null || candidate.effectiveTo >= date),
  );
  const shift = assignment?.shift ?? null;

  // FR-3.12: a date with no shift shows an empty status and links to P-12 —
  // never a guessed one.
  if (!shift) exceptions.push(EXCEPTION_CODE.NO_SHIFT_ASSIGNED);

  // 2. The punches whose work date is this date.
  const onThisDate = punches.filter(
    (punch) => punch.workDate === date && !punch.deletedAt,
  );

  for (const punch of onThisDate) {
    if (punch.workDateExceptionCode)
      exceptions.push(punch.workDateExceptionCode);
  }

  // 3. Duplicates are flagged, never deleted (FR-4.7, I-1). §8.3: an unset
  // window is prompted for, not guessed, so nothing is flagged until it is.
  const withDuplicates = await applyDuplicateFlags(
    onThisDate,
    policy.duplicatePunchWindowMinutes,
    exceptions,
  );

  // 4. Pairing. A missing counterpart is an exception, never zero hours
  // (FR-4.8, I-5).
  const {
    pairs,
    exceptions: pairingExceptions,
    livePunches,
  } = pairPunches(withDuplicates);
  exceptions.push(...pairingExceptions, ...impossibleDurationExceptions(pairs));
  const workedMinutes = sumWorkedMinutes(pairs);

  // 5, 6. Day type, then status in the fixed override → leave → punches order.
  const dayType = resolveDayType(
    date,
    inputs.holidaysByTeam[teamId] ?? [],
    inputs.weeklyOffByTeam[teamId] ?? null,
  );
  const leaveRecord =
    inputs.leaveRecords.find((record) => record.date === date) ?? null;

  /**
   * The ENGINE's own conclusion, which is what `computed` holds — the override
   * is passed as null deliberately.
   *
   * §16 states the full resolution order, override first. That order is
   * honoured by `effective()` (§12.1), which every reader goes through, rather
   * than by folding the override into `computed` here: §12.1 requires the two
   * values to sit side by side, and a computed block containing a human
   * decision has already lost the engine's answer.
   */
  const dayStatus = resolveDayStatus({
    dayType,
    override: null,
    authorisedLeave: leaveRecord,
    punches: livePunches,
  });

  // 7, 8. Punctuality and the ladder, both against the half actually worked
  // when the date is a half-day of leave (D-11).
  const punctuality = measurePunctuality({
    date,
    shift,
    policy,
    dayType,
    dayStatus,
    leaveRecord,
    livePunches,
    workedMinutes,
    exceptions,
  });

  const computed = {
    dayStatus,
    workedMinutes,
    ...punctuality,
  };

  const { record, changed } = await upsertDayRecord({
    userId,
    date,
    teamId,
    shiftId: shift ? String(shift._id) : null,
    dayType,
    computed,
    exceptions: [...new Set(exceptions)],
  });

  // 9. Reconcile the ledger against what this day now implies.
  await reconcileOneDay(record, { policy, leaveRecord, context });

  return changed;
}

async function applyDuplicateFlags(punchesOnDate, windowMinutes, exceptions) {
  if (windowMinutes === null || windowMinutes === undefined) {
    if (punchesOnDate.length > 0) {
      exceptions.push(EXCEPTION_CODE.SHIFT_CONFIGURATION_INCOMPLETE);
    }
    return punchesOnDate;
  }

  const duplicates = flagDuplicates(punchesOnDate, windowMinutes);

  return Promise.all(
    punchesOnDate.map(async (punch) => {
      const isDuplicate =
        duplicates.has(punch._id) || duplicates.has(String(punch._id));

      if (punch.isDuplicate !== isDuplicate) {
        await setPunchDerivedFields(String(punch._id), {
          workDate: punch.workDate,
          workDateExceptionCode: punch.workDateExceptionCode ?? null,
          isDuplicate,
        });
      }

      return { ...punch, isDuplicate };
    }),
  );
}

/**
 * §17 and §18. Returns the punctuality half of the computed block.
 *
 * The ladder runs only on a WORKING day that is not a full day of leave:
 * BR-11 already accounts for a full day, and a weekly off or holiday is not a
 * day anyone failed to attend.
 */
function measurePunctuality({
  date,
  shift,
  policy,
  dayType,
  dayStatus,
  leaveRecord,
  livePunches,
  workedMinutes,
  exceptions,
}) {
  const empty = {
    lateMinutes: 0,
    earlyMinutes: 0,
    isCompliant: true,
    isShortDay: false,
    deduction: 0,
    deductionRule: null,
    countsAsHolidayWork: false,
  };

  if (!shift) return empty;

  const window = shiftWindow(shift, date);
  if (window.invalidField) {
    // §13.3: a local time that never happened cannot be measured against.
    exceptions.push(EXCEPTION_CODE.SHIFT_CONFIGURATION_INCOMPLETE);
    return empty;
  }

  const isHalfDayLeave =
    dayStatus === DAY_STATUS.LEAVE && leaveRecord?.amount === 0.5;

  const requirement = effectiveRequirement(
    {
      start: window.start,
      end: window.end,
      requiredDailyMinutes: shift.requiredDailyMinutes,
    },
    isHalfDayLeave ? leaveRecord.halfDayPeriod : null,
  );

  const firstCheckIn = firstOfType(livePunches, PUNCH_TYPE.CHECK_IN);
  const lastCheckOut = lastOfType(livePunches, PUNCH_TYPE.CHECK_OUT);

  const late = lateMinutes(firstCheckIn?.at ?? null, requirement.checkStart);
  const early = earlyMinutes(lastCheckOut?.at ?? null, requirement.checkEnd);

  // BR-27, §17.4: status and counting are separate questions. A HOLIDAY_WORK
  // day below the threshold still shows its duration but is not counted.
  const countsAsHolidayWork =
    dayStatus === DAY_STATUS.HOLIDAY_WORK &&
    policy.holidayWorkThresholdPercent !== undefined &&
    clockedPercent(workedMinutes, requirement.requiredMinutes) >
      policy.holidayWorkThresholdPercent;

  const shortDay =
    policy.shortDayThresholdPercent === undefined
      ? false
      : isShortDay(
          workedMinutes,
          requirement.requiredMinutes,
          policy.shortDayThresholdPercent,
        );

  const isFullDayLeave =
    dayStatus === DAY_STATUS.LEAVE && leaveRecord?.amount === 1;
  const ladder = policy.leaveDeductionLadder ?? [];
  const runsLadder =
    dayType === DAY_TYPE.WORKING && !isFullDayLeave && ladder.length > 0;

  const attended = livePunches.length > 0;
  const deduction = runsLadder
    ? deductionFor({
        latenessPercent: latenessPercent(late, requirement.requiredMinutes),
        clockedPercent: clockedPercent(
          workedMinutes,
          requirement.requiredMinutes,
        ),
        attended,
        ladder,
      })
    : 0;

  return {
    lateMinutes: late,
    earlyMinutes: early,
    isCompliant: isCompliant(late, shift.graceMinutes ?? 0),
    isShortDay: shortDay,
    deduction,
    deductionRule: deductionRuleFor(ladder, deduction, attended),
    countsAsHolidayWork,
  };
}

/**
 * §23.3 step 9. Post what the day newly implies, reverse what it no longer
 * does. Never delete — a ledger entry is cancelled only by its reverse
 * (I-1, FR-6.8).
 */
async function reconcileOneDay(record, { policy, leaveRecord, context }) {
  const sourceId = String(record._id);
  const existing = await listLedgerEntriesForSource('dayRecord', sourceId);

  const desired = desiredEntriesForDay({
    dayRecord: record,
    policy,
    leaveRecord,
  });

  const { toPost, toReverse } = reconcileLedger({ desired, existing });

  if (toReverse.length > 0) {
    await reverseLedgerEntries(toReverse, {
      actor: context.actor,
      reason: context.reason,
    });
  }

  if (toPost.length > 0) {
    await postLedgerEntries(toPost, {
      sourceType: 'dayRecord',
      sourceId,
      sourceVersion: record.version,
      userId: record.userId,
      date: record.date,
      actor: context.actor,
    });
  }
}

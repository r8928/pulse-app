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
  getCtoApplicationForDate,
  getDayRecord,
  getPtoAwardForDate,
  listLedgerEntriesForSource,
  listPunchesInInstantRange,
  listTrackedUserIds,
  loadRecalculationInputs,
  postLedgerEntries,
  resolveTeamOnDate,
  reverseLedgerEntries,
  setPunchDerivedFields,
  upsertCtoCandidate,
  upsertDayRecord,
  upsertPtoCandidate,
} from '../database.js';
import { isWithinEmploymentPeriod } from '../utils/employment.js';
import { leaveYearsTouchedBy } from './accrual.js';
import { reconcileCandidate } from './candidates.js';
import { resolveDayStatus, resolveDayType } from './classify.js';
import {
  flagDuplicates,
  impossibleDurationExceptions,
  pairPunches,
  workedMinutes as sumWorkedMinutes,
} from './duration.js';
import { ensureEntitlementCredited } from './entitlement.js';
import {
  deductionFor,
  proposeCtoApplication,
  proposePtoAward,
} from './ladders.js';
import { desiredEntriesForDay, reconcileLedger } from './ledger.js';
import { ensurePtoExpiryPosted } from './pto.js';
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

  /**
   * `D-24`: the same no-cron shape, for PTO expiry rather than a leave
   * year's credit. One of the two places this guard runs from — the other
   * is the balance-read path — so a day that spends PTO through step 9's
   * candidates is measured against a balance that already excludes what
   * has expired.
   */
  await ensurePtoExpiryPosted(userId, context.actor);

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
  const computedByDate = new Map();

  for (const date of dates) {
    const outcome = await recalculateOneDay(date, {
      userId,
      inputs,
      punches,
      context,
    });
    computedByDate.set(date, outcome);
    if (outcome.changed) changed += 1;
  }

  /**
   * §12 pipeline step 9. Run as its own pass, AFTER every date's computed
   * block is written, because `BR-20` needs to compare a day against the
   * NEXT working day's own final outcome — which, within this very run, is
   * often computed chronologically after the day being judged.
   */
  for (const date of dates) {
    await proposeCandidatesForDay(date, {
      userId,
      inputs,
      computedByDate,
      context,
    });
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
  const { ctoLatenessPercent, attended, ...punctuality } = measurePunctuality({
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

  // Ledger reconciliation (§19, §23.3 step 9 of THAT list — the day's own
  // movements, distinct from proposing PTO/CTO, which is §12's separate
  // step 9 and runs in its own pass once every date here is settled).
  await reconcileOneDay(record, { policy, leaveRecord, context });

  return {
    changed,
    record,
    shift,
    policy,
    dayType,
    isFullDayLeave: dayStatus === DAY_STATUS.LEAVE && leaveRecord?.amount === 1,
    ctoLatenessPercent,
    attended,
  };
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
    // Not persisted (stripped before `computed` is built) — carried only for
    // step 9's CTO proposal, which needs the same figure the ladder itself
    // was tested against rather than re-deriving it a second time.
    ctoLatenessPercent: 0,
    attended: livePunches.length > 0,
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
    ctoLatenessPercent: latenessPercent(late, requirement.requiredMinutes),
    attended,
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

/** How far forward BR-20's lookahead searches before giving up (defensive). */
const MAX_LOOKAHEAD_DAYS = 14;

/**
 * D-20: "the next working day" is the next date whose type is WORKING for
 * the team held on it — not literally tomorrow. Walks forward resolving team
 * and calendar per date, exactly as `recalculateOneDay` does for the date it
 * is judging.
 */
function nextWorkingDate(date, inputs) {
  let candidate = date;

  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    candidate = format(addDays(parseISO(candidate), 1), 'yyyy-MM-dd');

    const teamId = resolveTeamOnDate(
      inputs.teamAssignments,
      candidate,
      inputs.user.teamId,
    );
    const type = resolveDayType(
      candidate,
      inputs.holidaysByTeam[teamId] ?? [],
      inputs.weeklyOffByTeam[teamId] ?? null,
    );

    if (type === DAY_TYPE.WORKING) return candidate;
  }

  return null;
}

/**
 * The `{ record, shift }` BR-20 needs for one date — from this same
 * recalculation run if that date was also visited, else from storage. A date
 * just beyond the range being recalculated commonly has an existing record
 * from an earlier run; one that has never been touched has none (`D-15`),
 * which is the same as not having worked it.
 */
async function resolveOutcomeForDate(date, { userId, inputs, computedByDate }) {
  const inThisRun = computedByDate.get(date);
  if (inThisRun) return { record: inThisRun.record, shift: inThisRun.shift };

  const record = await getDayRecord(userId, date);
  if (!record) return null;

  const assignment = inputs.shiftAssignments.find(
    (candidate) =>
      candidate.effectiveFrom <= date &&
      (candidate.effectiveTo === null || candidate.effectiveTo >= date),
  );

  return { record, shift: assignment?.shift ?? null };
}

/**
 * `reconcileCandidate` is generic — `{ status, rule, amount }` — but a stored
 * candidate keeps its PROPOSED figure under `proposedAmount`, distinctly from
 * `approvedAmount`/`appliedAmount` (`D-21`). Comparing `existing.amount`
 * against a stored document directly would always read `undefined`, forcing
 * an `UPDATE` every single recalculation even when nothing changed — silently
 * breaking `I-9`. This is the one translation between the two shapes.
 */
function asGenericCandidate(stored) {
  if (!stored) return null;
  return {
    status: stored.status,
    rule: stored.rule,
    amount: stored.proposedAmount,
    declinedSnapshot: stored.declinedSnapshot,
  };
}

/**
 * §12 pipeline step 9, §21–§22 (`D-20`, `D-21`, `D-22`). Proposes what the
 * pure ladder functions conclude, reconciles against any existing candidate,
 * and writes — never posting to the ledger (`FR-7.1`).
 */
async function proposeCandidatesForDay(
  date,
  { userId, inputs, computedByDate, context },
) {
  const today = computedByDate.get(date);
  if (!today) return;

  // PTO — needs the next working day's own outcome for BR-20.
  const nextDate = nextWorkingDate(date, inputs);
  const nextOutcome = nextDate
    ? await resolveOutcomeForDate(nextDate, { userId, inputs, computedByDate })
    : null;

  const ptoDesired = today.shift
    ? proposePtoAward({
        dayRecord: today.record,
        nextWorkingDayRecord: nextOutcome?.record ?? null,
        shift: today.shift,
        nextWorkingDayShift: nextOutcome?.shift ?? null,
      })
    : null;

  const existingPto = await getPtoAwardForDate(userId, date);
  const ptoVerdict = reconcileCandidate({
    desired: ptoDesired,
    existing: asGenericCandidate(existingPto),
  });
  await upsertPtoCandidate(userId, date, ptoVerdict, context.actor);

  // CTO — the same day-type gate the deduction ladder itself runs under
  // (§18): an ordinary working day, not a full day of leave.
  const runsCtoLadder =
    today.dayType === DAY_TYPE.WORKING && !today.isFullDayLeave;
  const ctoLadder = today.policy.ctoApplicationLadder ?? [];

  const ctoDesired =
    runsCtoLadder && ctoLadder.length > 0
      ? proposeCtoApplication({
          latenessPercent: today.ctoLatenessPercent,
          attended: today.attended,
          ladder: ctoLadder,
        })
      : null;

  const existingCto = await getCtoApplicationForDate(userId, date);
  const ctoVerdict = reconcileCandidate({
    desired: ctoDesired,
    existing: asGenericCandidate(existingCto),
  });
  await upsertCtoCandidate(userId, date, ctoVerdict, context.actor);
}

/**
 * §18.1, BR-9, D-14. The worse of two band tests, or the ladder's
 * did-not-attend row when the day was not attended at all.
 *
 * Lateness bands are `(from, to]` — spec.md's "over X up to Y" — and clocked
 * bands are `[from, to)` — "X up to under Y". `to: null` means unbounded
 * above. The did-not-attend row is found by its `didNotAttend` flag, never
 * by band search (D-14) — a row with `latenessFrom: null` does not
 * participate in the lateness test at all, and is excluded from the clocked
 * test outright regardless of what its clocked bounds happen to be.
 *
 * @param {{
 *   latenessPercent: number,
 *   clockedPercent: number,
 *   attended: boolean,
 *   ladder: Array<{ latenessFrom, latenessTo, clockedFrom, clockedTo, deduction, didNotAttend?: boolean }>,
 * }} input
 * @returns {number} the deduction, in days
 */
export function deductionFor({
  latenessPercent,
  clockedPercent,
  attended,
  ladder,
}) {
  if (!attended) {
    // Invariant I-5: an unconfigured ladder (no flagged row) deducts
    // nothing rather than guessing which row was meant. policyCompleteness
    // (Phase 4) already flags an empty leaveDeductionLadder separately.
    const row = ladder.find((candidate) => candidate.didNotAttend);
    return row ? row.deduction : 0;
  }

  const byLateness = ladder
    .filter(
      (row) => row.latenessFrom !== null && row.latenessFrom !== undefined,
    )
    .filter(
      (row) =>
        latenessPercent > row.latenessFrom &&
        (row.latenessTo === null || latenessPercent <= row.latenessTo),
    )
    .reduce((max, row) => Math.max(max, row.deduction), 0);

  const byClocked = ladder
    .filter((row) => !row.didNotAttend)
    .filter((row) => row.clockedFrom !== null && row.clockedFrom !== undefined)
    .filter(
      (row) =>
        clockedPercent >= row.clockedFrom &&
        (row.clockedTo === null || clockedPercent < row.clockedTo),
    )
    .reduce((max, row) => Math.max(max, row.deduction), 0);

  return Math.max(byLateness, byClocked);
}

/**
 * §21, D-20 (design record). `spec.md`'s BR-18–BR-20 state no numeric
 * threshold for "half a working day extra" or "one full extra working day",
 * so this reuses the one real signal the engine already computes for the
 * same shape of question: BR-27's holiday-work threshold (§17.4).
 *
 * A day already counted as HOLIDAY_WORK (`computed.countsAsHolidayWork`) is
 * the candidate. Below that threshold — shown on screen but not counted —
 * is not a candidate either; BR-27's own answer decides both questions.
 *
 * BR-20's "full night worked, then the next working day as well" is the one
 * two-day case: if the day AFTER this one (the next date whose type is
 * WORKING, not literally tomorrow) is ALSO worked in full, that pair earns
 * 2 instead of the first day's own BR-18/BR-19 figure. `recalculateDays`
 * resolves which record that is; this function only judges what it is given.
 *
 * @param {{
 *   dayRecord: { computed: object, override: object|null },
 *   nextWorkingDayRecord: { computed: object, override: object|null } | null,
 *   shift: { requiredDailyMinutes: number },
 *   nextWorkingDayShift: { requiredDailyMinutes: number } | null,
 * }} input
 * @returns {{ rule: 'BR-18'|'BR-19'|'BR-20', amount: number } | null}
 */
export function proposePtoAward({
  dayRecord,
  nextWorkingDayRecord,
  shift,
  nextWorkingDayShift,
}) {
  const status = dayRecord.override?.dayStatus ?? dayRecord.computed.dayStatus;
  if (status !== 'HOLIDAY_WORK') return null;
  if (!dayRecord.computed.countsAsHolidayWork) return null;

  const workedMinutes =
    dayRecord.override?.workedMinutes ?? dayRecord.computed.workedMinutes;
  const isFullDay = workedMinutes >= shift.requiredDailyMinutes;

  const nextDayFullyWorked =
    nextWorkingDayRecord &&
    nextWorkingDayShift &&
    (nextWorkingDayRecord.override?.workedMinutes ??
      nextWorkingDayRecord.computed.workedMinutes) >=
      nextWorkingDayShift.requiredDailyMinutes;

  if (isFullDay && nextDayFullyWorked) {
    return { rule: 'BR-20', amount: 2 };
  }

  return isFullDay
    ? { rule: 'BR-19', amount: 1 }
    : { rule: 'BR-18', amount: 0.5 };
}

/**
 * §22, BR-22–BR-26. Lateness-only bands — unlike `deductionFor`, there is no
 * clocked-hours test, because BR-22–25 state lateness alone. `(from, to]`,
 * matching `deductionFor`'s convention. `BR-26`'s balance check is not here:
 * it is a live check at approval time (`D-23`), not part of proposing.
 *
 * @param {{ latenessPercent: number, attended: boolean, ladder: Array }} input
 * @returns {{ rule: string, amount: number } | null}
 */
export function proposeCtoApplication({ latenessPercent, attended, ladder }) {
  if (!attended) {
    const row = ladder.find((candidate) => candidate.didNotAttend);
    return row ? { rule: row.rule, amount: row.apply } : null;
  }

  const match = ladder
    .filter((row) => !row.didNotAttend)
    .find(
      (row) =>
        row.latenessFrom !== null &&
        row.latenessFrom !== undefined &&
        latenessPercent > row.latenessFrom &&
        (row.latenessTo === null || latenessPercent <= row.latenessTo),
    );

  return match ? { rule: match.rule, amount: match.apply } : null;
}

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

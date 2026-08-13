/**
 * The single recalculation entry point (ARCHITECTURE 23.3, design record D-4).
 *
 * Every write that can change a number a user sees calls this, and it is the
 * only path that recomputes a day record. One code path cannot drift from a
 * second one, which is what `NFR-8` requires.
 *
 * **It does nothing yet, and that is the correct answer rather than a swallowed
 * one.** No day record, punch or ledger entry exists before Phase 5, so there
 * is genuinely nothing to refresh — a holiday moved today changes no computed
 * value because no value has been computed. Phase 5 fills in this one function
 * body and reopens none of its callers.
 *
 * When it is implemented it must stay idempotent (`I-9`): running it twice, or
 * resuming after a failure, must not double-post a ledger entry or
 * double-count a total. And it must never discard a human decision (`I-6`) —
 * it refreshes the engine's value and leaves any override standing.
 *
 * `D-2`: synchronous and scoped. The caller bounds the date range; wide
 * fan-out is handled by warning before saving rather than by a queue. If that
 * decision is ever reversed, moving this behind a queue means changing its
 * callers, not its logic. Do not build both paths.
 *
 * @param {string} userId — whose days to recompute, or null for every user on
 *   the team a policy change affects.
 * @param {{ from: string, to: string|null }} dateRange — inclusive calendar
 *   dates as `YYYY-MM-DD`. A null `to` means "from that date forward", which is
 *   what a policy or team-move change produces (`FR-3.14`).
 * @returns {Promise<{ recalculated: number }>} how many day records changed.
 */
export async function recalculateDays(userId, dateRange) {
  // Referenced so the signature is exercised rather than decorative, and so a
  // caller passing the wrong shape fails here rather than in Phase 5.
  void userId;
  void dateRange;

  return { recalculated: 0 };
}

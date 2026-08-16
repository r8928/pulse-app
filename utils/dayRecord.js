/**
 * ARCHITECTURE.md §12.1, FR-6.11. The effective value of any day-record field
 * is `override[field] ?? computed[field]`, written once so reports, screens
 * and the ledger cannot disagree about what a day says.
 *
 * `??` and not `||`: P-25 waives a deduction by overriding it to 0, and a
 * falsy check would discard that decision and re-apply the engine's figure —
 * an override silently undone, which is exactly what I-6 forbids.
 */
export function effective(dayRecord, field) {
  return dayRecord.override?.[field] ?? dayRecord.computed?.[field];
}

/** Whether `field` carries a human decision, for the marker S-10 and S-12 show. */
export function hasOverride(dayRecord, field) {
  return (
    dayRecord.override !== null &&
    dayRecord.override !== undefined &&
    dayRecord.override[field] !== undefined
  );
}

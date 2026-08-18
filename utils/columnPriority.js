/**
 * Column priority for data tables (`DESIGN.md` § Layout).
 *
 * Sizing starts at the tablet, so a wide table has to say which columns leave
 * first rather than overflowing and hoping. A cell marked with `hideBelow` is
 * absent until the width can afford it; the identifying column and the figure
 * the screen exists to show are never marked, so they survive to the narrowest
 * width.
 *
 * This is a shared helper rather than an `sx` written at each call site because
 * the same rule has to be applied to a column's header cell and to its body
 * cell, and the two drifting apart puts a value under the wrong heading.
 */

/** MUI's breakpoints, minus the one it makes no sense to drop a column at. */
export const COLUMN_BREAKPOINTS = Object.freeze(['sm', 'md', 'lg', 'xl']);

/**
 * @param {'sm'|'md'|'lg'|'xl'} breakpoint the width at which the column appears
 * @returns {{display: Record<string, string>}} an `sx` fragment for a TableCell
 */
export function hideBelow(breakpoint) {
  if (!COLUMN_BREAKPOINTS.includes(breakpoint)) {
    // A typo yields a media query that never matches, which hides the column
    // at every width instead of at narrow ones. That is invisible in review.
    throw new Error(
      `hideBelow received "${breakpoint}", which is not a column breakpoint. Use one of: ${COLUMN_BREAKPOINTS.join(', ')}.`,
    );
  }

  return { display: { xs: 'none', [breakpoint]: 'table-cell' } };
}

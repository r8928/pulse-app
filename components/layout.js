/**
 * The shell's own measurements, in one place.
 *
 * `AppShell` sizes its navigation bands with these, and anything that has to
 * sit INSIDE the content area — an overlay that covers the page but not the
 * navigation around it — has to subtract exactly the same numbers. Two copies
 * of that arithmetic drift the moment one band is resized, and the failure is
 * an overlay that hides the sidebar it was meant to leave alone.
 *
 * Data only, no React, so it can be read from a server component too.
 */

/** The rail keeps orientation without spending a third of a tablet on it. */
export const RAIL_WIDTH = 72;

/** Labels return once the width can afford them. */
export const DRAWER_WIDTH = 232;

/**
 * The band each navigation width applies at, as an `sx` value.
 *
 * `xs` has no permanent drawer at all — the navigation is a temporary one over
 * the top — so the content area starts at the left edge.
 */
export const CONTENT_INSET_LEFT = {
  xs: 0,
  sm: `${RAIL_WIDTH}px`,
  lg: `${DRAWER_WIDTH}px`,
};

/**
 * The top bar's height, at every width, as an `sx` fragment.
 *
 * These are MUI's own `mixins.toolbar` values spelled out. Reading
 * `theme.mixins.toolbar.minHeight` gives only the FIRST of them — 56 — so an
 * overlay positioned with it sits 8px too high from `sm` up and covers the
 * bottom of the bar it was meant to leave alone. The mixin is a style object
 * with media queries inside it, not a number.
 *
 * Spread into `sx` rather than assigned, since it carries its own breakpoints.
 */
export const CONTENT_INSET_TOP = Object.freeze({
  top: 56,
  '@media (min-width:0px) and (orientation: landscape)': { top: 48 },
  '@media (min-width:600px)': { top: 64 },
});

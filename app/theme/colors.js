/**
 * The single source of truth for every colour hex in Pulse.
 *
 * Nothing else in the application may contain a hex value. `theme.js` consumes
 * this file; components consume the theme. Any change here must be reflected in
 * `theme.js`, `DESIGN.md`, and `.impeccable/design.json` in the same commit.
 *
 * Direction: dense data-first admin, in CitrusBits colours. Near-neutral greys
 * still carry the interface — the citrus is the action colour and the status
 * register, not decoration — so colour stays available to mean something.
 *
 * **Two schemes, one rule: hue is constant, lightness flips.** Orange stays
 * orange and green stays green across light and dark, so the product is
 * recognisably itself in either. What cannot stay constant is lightness: a
 * token that clears AA on white is invisible on a near-black canvas, which is
 * why `accent` and every status pair carry a per-scheme value rather than one
 * shared hex. The two objects below are therefore required to hold identical
 * keys, and `app/__tests__/theme.test.js` fails if they ever drift.
 *
 * Every foreground/background *text* pair is asserted at WCAG 2.1 AA contrast
 * in that test, for both schemes (NFR-12, DC-11).
 */

// Status colours pair a text tone with the tinted surface it sits on, so a chip
// is defined once as a pair rather than assembled ad hoc at each call site.
//
// Success and warning are pulled towards the logo's green and yellow-gold.
// Warning is deliberately *yellow* rather than amber: the action colour is now
// orange, and a warning chip must never be mistakable for a button.
// Danger stays unmistakably red and info stays blue — neither has a logo
// equivalent, and inventing one would cost more in safety than it gained in
// brand.
const lightStatus = {
  success: { text: '#145a32', surface: '#e7f6ea', border: '#9fd6ac' },
  warning: { text: '#6b4a00', surface: '#fff8e1', border: '#ffd54f' },
  danger: { text: '#8c1d18', surface: '#fdecea', border: '#ef9a9a' },
  info: { text: '#0b4f6c', surface: '#e5f3f9', border: '#90caf9' },
  neutral: { text: '#41474f', surface: '#eef0f3', border: '#cdd2d9' },
};

// The same five hues, inverted: a dark tinted wash carrying light same-hue
// text. Keeping the light surfaces here would leave a row of pale mint and
// cream chips glowing on a near-black table.
const darkStatus = {
  success: { text: '#56d364', surface: '#132b1c', border: '#2f6b3a' },
  warning: { text: '#e3b341', surface: '#2a2211', border: '#6b5327' },
  danger: { text: '#ff7b72', surface: '#2c1618', border: '#6e2c2c' },
  info: { text: '#79c0ff', surface: '#101f33', border: '#2a4a72' },
  neutral: { text: '#adb6c0', surface: '#21262d', border: '#444c56' },
};

export const lightColors = {
  // Structure
  background: '#f7f8fa',
  surface: '#ffffff',
  surfaceMuted: '#f1f3f6',
  border: '#dfe3e8',
  borderStrong: '#c3cad3',

  // Text
  textPrimary: '#1a1f26',
  textSecondary: '#5a6472',
  textOnAccent: '#ffffff',

  // Action. One hue, used sparingly.
  //
  // This is the logo's orange deepened until it can carry white text: the mark
  // itself is around #f7941e, which is 2.2:1 against white and cannot be a
  // button. Deepened it reaches 5.4:1 and stays in the same family. The bright
  // logo orange is still used at full strength — but only where it carries no
  // text, such as the mark in the AppBar and the active-nav indicator.
  accent: '#b54708',
  accentHover: '#92400e',
  accentSurface: '#fdf0e6',

  // Focus ring. Deliberately high contrast: keyboard navigation is a
  // first-class input mode, not an afterthought (NFR-12).
  focusRing: '#c2410c',

  // Status
  ...lightStatus,
};

export const darkColors = {
  // Structure. The GitHub dark scale: a near-black blue canvas with raised
  // surfaces a step above it, rather than grey-on-grey.
  background: '#0d1117',
  surface: '#161b22',
  surfaceMuted: '#1c2128',
  border: '#30363d',
  borderStrong: '#444c56',

  // Text
  textPrimary: '#e6edf3',
  textSecondary: '#9198a1',
  // A light-orange button takes dark text, not white — 7.5:1 rather than 2.1:1.
  textOnAccent: '#0d1117',

  // Action. The same orange, lifted off the dark canvas.
  accent: '#f0883e',
  accentHover: '#ffa657',
  accentSurface: '#2d1e12',

  focusRing: '#f0883e',

  // Status
  ...darkStatus,
};

export const STATUS_KEYS = Object.keys(lightStatus);

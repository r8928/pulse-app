/**
 * The single source of truth for every colour hex in Pulse.
 *
 * Nothing else in the application may contain a hex value. `theme.js` consumes
 * this file; components consume the theme. Any change here must be reflected in
 * `theme.js`, `DESIGN.md`, and `.impeccable/design.json` in the same commit.
 *
 * Direction: dense data-first admin. Near-neutral greys carry the interface and
 * a single restrained accent carries action, so that colour stays available to
 * mean something when a status needs it.
 *
 * Every foreground/background pair below is asserted at WCAG 2.1 AA contrast in
 * `app/__tests__/theme.test.js` (NFR-12, DC-11).
 */

// Status colours pair a text tone with the tinted surface it sits on, so a chip
// is defined once as a pair rather than assembled ad hoc at each call site.
const status = {
  success: { text: '#1b5e20', surface: '#e8f5e9', border: '#a5d6a7' },
  warning: { text: '#7a4f01', surface: '#fff4e5', border: '#ffcc80' },
  danger: { text: '#8c1d18', surface: '#fdecea', border: '#ef9a9a' },
  info: { text: '#0b4f6c', surface: '#e5f3f9', border: '#90caf9' },
  neutral: { text: '#41474f', surface: '#eef0f3', border: '#cdd2d9' },
};

export const colors = {
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
  accent: '#2f5bb7',
  accentHover: '#254a99',
  accentSurface: '#eaf0fb',

  // Focus ring. Deliberately high contrast: keyboard navigation is a
  // first-class input mode, not an afterthought (NFR-12).
  focusRing: '#1a56db',

  // Status
  ...status,
};

export const STATUS_KEYS = Object.keys(status);

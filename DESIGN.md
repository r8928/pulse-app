---
name: Pulse
direction: dense data-first admin
fontSans: Inter
fontMono: JetBrains Mono
borderRadius: 6
spacingBase: 8
background: '#f7f8fa'
surface: '#ffffff'
surfaceMuted: '#f1f3f6'
border: '#dfe3e8'
borderStrong: '#c3cad3'
textPrimary: '#1a1f26'
textSecondary: '#5a6472'
textOnAccent: '#ffffff'
accent: '#2f5bb7'
accentHover: '#254a99'
accentSurface: '#eaf0fb'
focusRing: '#1a56db'
statusSuccess: { text: '#1b5e20', surface: '#e8f5e9', border: '#a5d6a7' }
statusWarning: { text: '#7a4f01', surface: '#fff4e5', border: '#ffcc80' }
statusDanger: { text: '#8c1d18', surface: '#fdecea', border: '#ef9a9a' }
statusInfo: { text: '#0b4f6c', surface: '#e5f3f9', border: '#90caf9' }
statusNeutral: { text: '#41474f', surface: '#eef0f3', border: '#cdd2d9' }
---

# Pulse — Design

## The four surfaces

These must never drift. A change to one is a change to all four in the same commit:

| Surface | Holds |
| ------- | ----- |
| `app/theme/colors.js` | Every hex in the application. Nothing else may contain one. |
| `app/theme/theme.js` | Radii, shadows, spacing, density, typography metrics, component variants. |
| `DESIGN.md` | This file — the frontmatter above and the reasoning below. |
| `.impeccable/design.json` | Machine-readable mirror of both. |

`app/theme/fonts.js` is a fifth file but not a token surface: it only binds the
two families to the CSS custom properties `theme.js` references.

## Direction

Dense data-first admin. Pulse replaces a spreadsheet, and the people using it
read it as a spreadsheet: `S-10`, `S-14` and `S-20` are mostly figures. So the
interface stays near-neutral and quiet, and colour is held in reserve for
status, where it has to mean something.

One accent hue (`#2f5bb7`) carries action. Headings are deliberately
undersized relative to the data — the numbers are the content, not the chrome.

## Rules

**Colour lives in one file.** Hexes in `colors.js`, nothing anywhere else. A
component that needs a colour selects a theme variant.

**Status is never colour alone** (`NFR-12`, `DC-11`). Every status chip renders
an icon and a text label. Each `statusX` variant publishes a
`--status-icon-gap` custom property that reserves the icon's space, so a chip
built without one is visibly wrong rather than quietly inaccessible.

**Status presets are theme variants, never `sx` maps.** `STATUS_VARIANTS` in
`theme.js` lists them; components select one with the `variant` prop. A
severity-to-style object literal in a component is a defect.

**Typography is variants only.** Never set `fontSize`, `fontWeight` or
`fontFamily` outside the theme. Six custom variants exist — `pageTitle`,
`sectionTitle`, `metricLabel`, `metricValue`, `mono`, `bodyStrong`. If none
fits, add one here rather than styling in place.

**Numerals are tabular** on `metricValue` and `mono`, so a column of durations
or balances aligns on the decimal instead of shimmering row to row.

**Custom variants map to real elements** — `h1`, `h2`, `code`, `strong` — never
a bare `div`, so the document outline stays meaningful to a screen reader.

**Focus is always visible.** A 2px ring at `#1a56db` with 2px offset on every
`:focus-visible`. Interactions are designed keyboard-first, then touch, then
mouse. Removing the ring without replacing it is a defect.

## Contrast

Every foreground/background pair is asserted at WCAG 2.1 AA (4.5:1 body text)
in `app/__tests__/theme.test.js`, which computes real relative luminance rather
than trusting the eye. Measured ratios:

| Pair | Ratio |
| ---- | ----- |
| Primary text on background | 15.7:1 |
| Primary text on surface | 16.6:1 |
| Secondary text on surface | 6.0:1 |
| Success text on success surface | 7.0:1 |
| Warning text on warning surface | 6.6:1 |
| Danger text on danger surface | 8.0:1 |
| Info text on info surface | 7.9:1 |
| White on accent | 6.4:1 |

Changing any hex re-runs these assertions. A change that drops a pair below
4.5:1 fails the build rather than shipping.

## Where token tests live

Token assertions belong in `app/__tests__/theme.test.js` and nowhere else. If a
design-token change breaks an app-layer test, that test was asserting the wrong
thing — assert state, variant, role, visibility or enabled/disabled instead.

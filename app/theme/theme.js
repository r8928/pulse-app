import { createTheme } from '@mui/material/styles';
import { darkColors, lightColors, STATUS_KEYS } from './colors.js';

/**
 * The Pulse theme. Radii, spacing and typography metrics live here; hexes live
 * in `colors.js`. Components must not set fontSize, fontWeight or fontFamily
 * themselves — they select a variant defined below.
 *
 * **Two colour schemes, one theme.** `cssVariables.colorSchemeSelector: 'class'`
 * makes MUI emit both palettes as CSS custom properties switched by a class on
 * `<html>`. `InitColorSchemeScript` in the root layout writes that class before
 * the first paint, so there is no flash of the wrong scheme, and switching is a
 * class change rather than a re-render. Nothing in the app stores the choice
 * itself — `useColorScheme()` persists it to localStorage — which is what keeps
 * this off the React Context API that `CLAUDE.md` forbids.
 *
 * There is deliberately no shadow scale. Pulse is flat: surfaces are separated
 * by a 1px border and the recessed `surfaceMuted` tone, never by elevation.
 * See `DESIGN.md` § Elevation & Depth.
 *
 * Font families resolve through CSS custom properties set by `fonts.js` on the
 * root layout. Keeping the reference indirect means this module imports no
 * Next.js runtime and stays testable under plain Node.
 */

const FONT_SANS = 'var(--font-sans), system-ui, sans-serif';
const FONT_MONO = 'var(--font-mono), ui-monospace, monospace';

// Figures must align down a column. Every variant that can hold a number gets
// tabular, lining numerals.
const TABULAR = 'tabular-nums lining-nums';

/**
 * The floor for anything a finger is expected to hit (`DESIGN.md` § Layout).
 *
 * Deliberately a floor on the *target*, not on density. `Table`, `TextField`
 * and `Chip` stay `size='small'`: these screens are read as tables, and
 * inflating every row to 44px would trade the thing they exist for. Where a
 * dense row carries a touchable control, the control grows and the row does
 * not.
 */
export const TOUCH_TARGET = 44;

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** Chip variant names, one per status key. Components select these by `variant`. */
export const STATUS_VARIANTS = STATUS_KEYS.map(
  (key) => `status${capitalise(key)}`,
);

/**
 * One palette per scheme, built from the same role names.
 *
 * `surfaceMuted`, `borderStrong` and `focusRing` are carried as custom palette
 * keys rather than left in `colors.js` alone, so they are emitted as CSS
 * variables too and a component can reach them through the theme like any
 * other token.
 */
const paletteFor = (mode, colors) => ({
  mode,
  background: {
    default: colors.background,
    paper: colors.surface,
  },
  primary: {
    main: colors.accent,
    dark: colors.accentHover,
    light: colors.accentSurface,
    contrastText: colors.textOnAccent,
  },
  text: {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
  },
  divider: colors.border,
  surfaceMuted: colors.surfaceMuted,
  borderStrong: colors.borderStrong,
  focusRing: colors.focusRing,
  success: { main: colors.success.text, light: colors.success.surface },
  warning: { main: colors.warning.text, light: colors.warning.surface },
  error: { main: colors.danger.text, light: colors.danger.surface },
  info: { main: colors.info.text, light: colors.info.surface },
});

/**
 * Status is never conveyed by colour alone (NFR-12, DC-11). Each variant
 * publishes a gap custom property that reserves room for the icon every status
 * chip is required to render alongside its label.
 *
 * The style is a callback because a chip has to answer to both schemes:
 * `theme.applyStyles('dark', …)` attaches the dark branch under whichever
 * selector the theme is configured with, so the selector is never spelled out
 * here and cannot fall out of step with `colorSchemeSelector`.
 */
const statusChipVariants = STATUS_KEYS.map((key) => ({
  props: { variant: `status${capitalise(key)}` },
  style: ({ theme }) => ({
    '--status-icon-gap': '6px',
    color: lightColors[key].text,
    backgroundColor: lightColors[key].surface,
    border: `1px solid ${lightColors[key].border}`,
    fontWeight: 600,
    '& .MuiChip-icon': {
      color: 'inherit',
      marginInlineEnd: 'var(--status-icon-gap)',
    },
    ...theme.applyStyles('dark', {
      color: darkColors[key].text,
      backgroundColor: darkColors[key].surface,
      borderColor: darkColors[key].border,
    }),
  }),
}));

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },

  colorSchemes: {
    light: { palette: paletteFor('light', lightColors) },
    dark: { palette: paletteFor('dark', darkColors) },
  },

  spacing: 8,

  shape: {
    borderRadius: 6,
  },

  typography: {
    fontFamily: FONT_SANS,

    // A screen states what its numbers mean (NFR-2), so headings stay quiet and
    // the data carries the emphasis.
    pageTitle: {
      fontFamily: FONT_SANS,
      fontSize: '1.5rem',
      fontWeight: 650,
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
    },
    sectionTitle: {
      fontFamily: FONT_SANS,
      fontSize: '1rem',
      fontWeight: 620,
      lineHeight: 1.35,
    },
    metricLabel: {
      fontFamily: FONT_SANS,
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    },
    metricValue: {
      fontFamily: FONT_SANS,
      fontSize: '1.75rem',
      fontWeight: 640,
      lineHeight: 1.15,
      fontVariantNumeric: TABULAR,
    },
    mono: {
      fontFamily: FONT_MONO,
      fontSize: '0.8125rem',
      lineHeight: 1.5,
      fontVariantNumeric: TABULAR,
    },
    bodyStrong: {
      fontFamily: FONT_SANS,
      fontSize: '0.875rem',
      fontWeight: 620,
      lineHeight: 1.5,
    },
  },

  components: {
    MuiCssBaseline: {
      // Note the signature: CssBaseline hands its override callback the theme
      // *itself*, where a component `variants` entry is handed `{ theme }`.
      // Destructuring this one the other way yields `undefined.vars` and fails
      // only at prerender, so it is spelled out here rather than inferred.
      styleOverrides: (t) => ({
        // Keyboard navigation is a first-class input mode (NFR-12, DC-11).
        // Never remove this ring without replacing it with a visible one.
        ':focus-visible': {
          outline: `2px solid ${t.vars.palette.focusRing}`,
          outlineOffset: '2px',
          borderRadius: '3px',
        },

        body: {
          WebkitFontSmoothing: 'antialiased',
        },
      }),
    },

    MuiTypography: {
      defaultProps: {
        // Custom variants render as real elements so the document outline stays
        // meaningful to a screen reader.
        variantMapping: {
          pageTitle: 'h1',
          sectionTitle: 'h2',
          metricLabel: 'span',
          metricValue: 'p',
          mono: 'code',
          bodyStrong: 'strong',
        },
      },
      styleOverrides: {
        // A label is quieter than the value it introduces, in either scheme.
        metricLabel: ({ theme: t }) => ({
          color: t.vars.palette.text.secondary,
        }),
      },
    },

    MuiChip: {
      variants: statusChipVariants,
      defaultProps: { size: 'small' },
    },

    // Dense by default: these screens are read as tables, not brochures.
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none' } },
    },

    // Interactions are keyboard-first, then touch, then mouse. These three are
    // the controls a finger actually lands on.
    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET },
      },
    },
    MuiMenuItem: {
      styleOverrides: { root: { minHeight: TOUCH_TARGET } },
    },
    MuiListItemButton: {
      styleOverrides: { root: { minHeight: TOUCH_TARGET } },
    },

    MuiDialog: {
      defaultProps: { maxWidth: 'sm', fullWidth: true },
      styleOverrides: {
        // Below sm a dialog fills the screen. A dialog that scrolls inside a
        // scrolling page on a phone is worse than a screen would have been.
        paper: ({ theme: t }) => ({
          [t.breakpoints.down('sm')]: {
            margin: 0,
            width: '100%',
            maxWidth: '100%',
            height: '100%',
            maxHeight: '100%',
            borderRadius: 0,
          },
        }),
      },
    },
  },
});

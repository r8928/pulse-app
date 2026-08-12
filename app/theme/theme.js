import { createTheme } from '@mui/material/styles';
import { colors, STATUS_KEYS } from './colors.js';

/**
 * The Pulse theme. Radii, shadows, spacing and typography metrics live here;
 * hexes live in `colors.js`. Components must not set fontSize, fontWeight or
 * fontFamily themselves — they select a variant defined below.
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

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** Chip variant names, one per status key. Components select these by `variant`. */
export const STATUS_VARIANTS = STATUS_KEYS.map(
  (key) => `status${capitalise(key)}`,
);

/**
 * Status is never conveyed by colour alone (NFR-12, DC-11). Each variant
 * publishes a gap custom property that reserves room for the icon every status
 * chip is required to render alongside its label.
 */
const statusChipVariants = STATUS_KEYS.map((key) => ({
  props: { variant: `status${capitalise(key)}` },
  style: {
    '--status-icon-gap': '6px',
    color: colors[key].text,
    backgroundColor: colors[key].surface,
    border: `1px solid ${colors[key].border}`,
    fontWeight: 600,
    '& .MuiChip-icon': {
      color: 'inherit',
      marginInlineEnd: 'var(--status-icon-gap)',
    },
  },
}));

export const theme = createTheme({
  spacing: 8,

  shape: {
    borderRadius: 6,
  },

  palette: {
    mode: 'light',
    background: {
      default: colors.background,
      paper: colors.surface,
    },
    primary: {
      main: colors.accent,
      dark: colors.accentHover,
      contrastText: colors.textOnAccent,
    },
    text: {
      primary: colors.textPrimary,
      secondary: colors.textSecondary,
    },
    divider: colors.border,
    success: { main: colors.success.text, light: colors.success.surface },
    warning: { main: colors.warning.text, light: colors.warning.surface },
    error: { main: colors.danger.text, light: colors.danger.surface },
    info: { main: colors.info.text, light: colors.info.surface },
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
      color: colors.textSecondary,
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
      styleOverrides: `
        :root {
          color-scheme: light;
        }

        /* Keyboard navigation is a first-class input mode (NFR-12, DC-11).
           Never remove this ring without replacing it with a visible one. */
        :focus-visible {
          outline: 2px solid ${colors.focusRing};
          outline-offset: 2px;
          border-radius: 3px;
        }

        /* A dense grid still has to be readable when a row wraps. */
        body {
          background-color: ${colors.background};
          color: ${colors.textPrimary};
          -webkit-font-smoothing: antialiased;
        }
      `,
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
  },
});

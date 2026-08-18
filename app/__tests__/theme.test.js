import { describe, expect, it } from 'vitest';
import { darkColors, lightColors, STATUS_KEYS } from '../theme/colors.js';
import { STATUS_VARIANTS, TOUCH_TARGET, theme } from '../theme/theme.js';

// --- WCAG contrast helpers -------------------------------------------------
// Test-only. NFR-12 and DC-11 require WCAG 2.1 AA contrast, which is a claim
// worth proving rather than asserting by eye. AA is 4.5:1 for body text and
// 3:1 for large text and non-text indicators.
//
// Only *text* pairs are asserted. A chip border is deliberately not held to
// 3:1: WCAG 1.4.11 applies to non-text content only where it is the sole
// identifier of a state, and every status chip here carries an icon and a
// written label (DC-11). Forcing 3:1 on a divider would mean the heavy borders
// the flat direction in DESIGN.md explicitly rejects.

const channelToLinear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex) => {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
};

const contrastRatio = (foreground, background) => {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Both schemes are held to identical rules, so both are looped, never one. */
const SCHEMES = [
  ['light', lightColors],
  ['dark', darkColors],
];

/**
 * A theme entry that has to answer to both schemes is written as a callback, so
 * that `theme.applyStyles` can attach the dark branch under whichever selector
 * the theme was configured with. Resolving it here asserts what the callback
 * produces — its public contract — rather than that it happens to be a function.
 *
 * The two callbacks take **different arguments**, and conflating them is not
 * hypothetical: it shipped a theme that only failed at prerender. A component
 * `variants` entry receives `{ theme }`; `MuiCssBaseline.styleOverrides`
 * receives the theme itself.
 */
const resolveVariant = (entry) =>
  typeof entry === 'function' ? entry({ theme }) : entry;

const resolveBaseline = (entry) =>
  typeof entry === 'function' ? entry(theme) : entry;

// --- colors.js -------------------------------------------------------------

describe('colors', () => {
  it.each(SCHEMES)(
    'exposes every palette role the application renders (%s)',
    (_name, scheme) => {
      expect(Object.keys(scheme)).toEqual(
        expect.arrayContaining([
          'background',
          'surface',
          'surfaceMuted',
          'border',
          'borderStrong',
          'textPrimary',
          'textSecondary',
          'textOnAccent',
          'accent',
          'accentHover',
          'accentSurface',
          'focusRing',
          ...STATUS_KEYS,
        ]),
      );
    },
  );

  it('gives the two schemes identical role keys, so neither can drift', () => {
    expect(Object.keys(lightColors).sort()).toEqual(
      Object.keys(darkColors).sort(),
    );
  });

  it.each(SCHEMES)(
    'holds only six-digit hex values, so no token is a named or rgb string (%s)',
    (_name, scheme) => {
      const leaves = JSON.stringify(scheme).match(/"#?[^"]*"/g) ?? [];
      const hexes = leaves.filter((leaf) => leaf.startsWith('"#'));
      expect(hexes.length).toBeGreaterThan(0);
      for (const hex of hexes) {
        expect(hex.slice(1, -1)).toMatch(/^#[0-9a-f]{6}$/);
      }
    },
  );

  it('renders the dark scheme on a darker canvas than the light one', () => {
    expect(relativeLuminance(darkColors.background)).toBeLessThan(
      relativeLuminance(lightColors.background),
    );
  });

  it('retunes the accent per scheme rather than reusing one hex', () => {
    // Hue is constant across schemes; lightness flips. A single accent value
    // cannot clear AA against both a white and a near-black canvas.
    expect(lightColors.accent).not.toBe(darkColors.accent);
  });
});

// --- contrast --------------------------------------------------------------

describe.each(SCHEMES)('theme contrast (%s)', (_name, scheme) => {
  it('renders primary text on the page background at AA contrast', () => {
    expect(
      contrastRatio(scheme.textPrimary, scheme.background),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders primary text on a surface at AA contrast', () => {
    expect(
      contrastRatio(scheme.textPrimary, scheme.surface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders secondary text at AA contrast, since it carries real values', () => {
    expect(
      contrastRatio(scheme.textSecondary, scheme.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(scheme.textSecondary, scheme.surfaceMuted),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders the label on a primary button at AA contrast, in both its states', () => {
    expect(
      contrastRatio(scheme.textOnAccent, scheme.accent),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(scheme.textOnAccent, scheme.accentHover),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders accent-coloured text on its own tinted surface at AA contrast', () => {
    expect(
      contrastRatio(scheme.accent, scheme.accentSurface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('draws the focus ring at 3:1, so keyboard focus is never lost', () => {
    expect(
      contrastRatio(scheme.focusRing, scheme.background),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(scheme.focusRing, scheme.surface),
    ).toBeGreaterThanOrEqual(3);
  });

  it('renders each status colour against its own chip background at AA contrast', () => {
    for (const status of STATUS_KEYS) {
      expect(
        contrastRatio(scheme[status].text, scheme[status].surface),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// --- colour schemes --------------------------------------------------------

describe('colour schemes', () => {
  it('registers both schemes, so the toggle has something to switch between', () => {
    expect(theme.colorSchemes.light).toBeDefined();
    expect(theme.colorSchemes.dark).toBeDefined();
  });

  it('emits CSS variables under a class selector, so the scheme is set before paint', () => {
    // InitColorSchemeScript writes the class onto <html> ahead of hydration.
    // Without the class selector there is a flash of the wrong scheme.
    expect(theme.vars).toBeTruthy();
    expect(theme.colorSchemeSelector).toBe('class');
  });

  it('drives each scheme palette from its own token set', () => {
    expect(theme.colorSchemes.light.palette.background.default).toBe(
      lightColors.background,
    );
    expect(theme.colorSchemes.dark.palette.background.default).toBe(
      darkColors.background,
    );
  });
});

// --- typography ------------------------------------------------------------

describe('theme typography', () => {
  it('defines every custom variant components select by name', () => {
    for (const variant of [
      'pageTitle',
      'sectionTitle',
      'metricLabel',
      'metricValue',
      'mono',
      'bodyStrong',
    ]) {
      expect(theme.typography[variant]).toBeDefined();
    }
  });

  it('maps every custom variant to a semantic element, never a bare div', () => {
    const mapping = theme.components.MuiTypography.defaultProps.variantMapping;
    for (const variant of [
      'pageTitle',
      'sectionTitle',
      'metricLabel',
      'metricValue',
      'mono',
      'bodyStrong',
    ]) {
      expect(mapping[variant]).toBeDefined();
      expect(mapping[variant]).not.toBe('div');
    }
  });

  it('sets numerals to tabular so figures align down a column', () => {
    expect(theme.typography.metricValue.fontVariantNumeric).toContain(
      'tabular-nums',
    );
    expect(theme.typography.mono.fontVariantNumeric).toContain('tabular-nums');
  });
});

// --- status variants -------------------------------------------------------

describe('status presentation', () => {
  it('registers a chip variant for every status, so none is styled inline', () => {
    const registered = theme.components.MuiChip.variants.map(
      (entry) => entry.props.variant,
    );
    expect(registered).toEqual(expect.arrayContaining(STATUS_VARIANTS));
  });

  it('never conveys status by colour alone, so every variant carries an icon slot', () => {
    for (const variant of theme.components.MuiChip.variants) {
      expect(resolveVariant(variant.style)).toHaveProperty('--status-icon-gap');
    }
  });

  it('restyles every status chip for the dark scheme, so none keeps a light wash', () => {
    // A pale mint chip left unchanged on a near-black table glows. Each
    // variant carries a dark-scheme branch rather than one fixed hex.
    for (const variant of theme.components.MuiChip.variants) {
      const key = variant.props.variant.replace(/^status/, '').toLowerCase();
      expect(JSON.stringify(resolveVariant(variant.style))).toContain(
        darkColors[key].surface,
      );
    }
  });
});

// --- shape and focus -------------------------------------------------------

describe('theme interaction', () => {
  it('gives every focusable a visible focus ring, for keyboard-first navigation', () => {
    const baseline = resolveBaseline(
      theme.components.MuiCssBaseline.styleOverrides,
    );

    // Resolving it at all is half the assertion: called with the wrong
    // argument this throws, which is how the signature stays honest.
    expect(baseline[':focus-visible'].outline).toContain(
      'var(--mui-palette-focusRing',
    );
  });

  it('exposes a single radius scale rather than per-component magic numbers', () => {
    expect(typeof theme.shape.borderRadius).toBe('number');
  });
});

// --- touch and responsive --------------------------------------------------

describe('theme input targets', () => {
  it('gives an icon button a 44px target, since touch outranks mouse', () => {
    // DESIGN.md puts the floor on the target, not on density: tables, fields
    // and chips stay size='small'.
    const root = theme.components.MuiIconButton.styleOverrides.root;
    expect(root.minWidth).toBe(TOUCH_TARGET);
    expect(root.minHeight).toBe(TOUCH_TARGET);
  });

  it('gives a menu item a 44px target', () => {
    expect(theme.components.MuiMenuItem.styleOverrides.root.minHeight).toBe(
      TOUCH_TARGET,
    );
  });

  it('keeps rows dense, so the target floor did not become a density change', () => {
    expect(theme.components.MuiTable.defaultProps.size).toBe('small');
    expect(theme.components.MuiTextField.defaultProps.size).toBe('small');
  });
});

describe('theme dialogs', () => {
  it('fills the screen below sm, rather than scrolling inside a scrolling page', () => {
    const paper = resolveVariant(
      theme.components.MuiDialog.styleOverrides.paper,
    );
    const down = theme.breakpoints.down('sm');

    expect(paper[down]).toBeDefined();
    expect(paper[down].maxWidth).toBe('100%');
    expect(paper[down].margin).toBe(0);
  });
});

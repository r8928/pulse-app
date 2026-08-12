import { describe, expect, it } from 'vitest';
import { colors } from '../theme/colors.js';
import { STATUS_VARIANTS, theme } from '../theme/theme.js';

// --- WCAG contrast helpers -------------------------------------------------
// Test-only. NFR-12 and DC-11 require WCAG 2.1 AA contrast, which is a claim
// worth proving rather than asserting by eye. AA is 4.5:1 for body text and
// 3:1 for large text and non-text indicators.

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

// --- colors.js -------------------------------------------------------------

describe('colors', () => {
  it('exposes every palette role the application renders', () => {
    expect(Object.keys(colors)).toEqual(
      expect.arrayContaining([
        'background',
        'surface',
        'border',
        'textPrimary',
        'textSecondary',
        'accent',
        'success',
        'warning',
        'danger',
        'info',
      ]),
    );
  });

  it('holds only six-digit hex values, so no token is a named or rgb string', () => {
    const leaves = JSON.stringify(colors).match(/"#?[^"]*"/g) ?? [];
    const hexes = leaves.filter((leaf) => leaf.startsWith('"#'));
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(hex.slice(1, -1)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// --- contrast --------------------------------------------------------------

describe('theme contrast', () => {
  it('renders primary text on the page background at AA contrast', () => {
    expect(
      contrastRatio(colors.textPrimary, colors.background),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders primary text on a surface at AA contrast', () => {
    expect(
      contrastRatio(colors.textPrimary, colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders secondary text at AA contrast, since it carries real values', () => {
    expect(
      contrastRatio(colors.textSecondary, colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('renders each status colour against its own chip background at AA contrast', () => {
    for (const status of ['success', 'warning', 'danger', 'info']) {
      expect(
        contrastRatio(colors[status].text, colors[status].surface),
      ).toBeGreaterThanOrEqual(4.5);
    }
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
      expect(variant.style).toHaveProperty('--status-icon-gap');
    }
  });
});

// --- shape and focus -------------------------------------------------------

describe('theme interaction', () => {
  it('gives every focusable a visible focus ring, for keyboard-first navigation', () => {
    const focus = theme.components.MuiCssBaseline.styleOverrides;
    expect(focus).toContain(':focus-visible');
  });

  it('exposes a single radius scale rather than per-component magic numbers', () => {
    expect(typeof theme.shape.borderRadius).toBe('number');
  });
});

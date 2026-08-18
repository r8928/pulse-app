import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import { PERMISSIONS } from '../../constants/index.js';
import { AppShell } from '../AppShell.jsx';

/**
 * Asserts what the shell offers a given viewer — never a colour, and never a
 * breakpoint. Which band is visible at which width is CSS, and jsdom has no
 * layout; what matters here is that every band is built from one list and that
 * a rail item keeps a name when its label is not drawn.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const user = {
  name: 'Amara Okafor',
  role: 'OFFICE_ADMIN',
  permissions: { [PERMISSIONS.USER_READ]: 'ALL' },
};

const renderShell = (overrides = {}) =>
  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <AppShell user={{ ...user, ...overrides }} signOutAction={vi.fn()}>
        <p>Content</p>
      </AppShell>
    </ThemeProvider>,
  );

describe('AppShell', () => {
  it('offers the appearance control in the top bar', async () => {
    renderShell();

    expect(
      await screen.findByRole('button', { name: /^appearance:/i }),
    ).toBeInTheDocument();
  });

  it('names every navigation item, so the icon rail is not icons alone', () => {
    // Both permanent bands are in the DOM — which one is visible is CSS, and
    // jsdom computes no layout. Asserting both carry the name is the point:
    // between sm and lg the label is not drawn, so a missing aria-label would
    // leave the rail a row of unnamed pictures and drop this to one match.
    // The temporary drawer is closed and aria-hidden, so it does not count.
    renderShell();

    expect(screen.getAllByRole('link', { name: 'People' })).toHaveLength(2);
  });

  it('shows only the modules the viewer holds a permission for', () => {
    renderShell();

    expect(
      screen.getAllByRole('link', { name: 'People' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', { name: 'Audit' }),
    ).not.toBeInTheDocument();
  });

  it('keeps sign out inside the account menu rather than in the bar itself', async () => {
    const clicker = userEvent.setup();
    renderShell();

    expect(
      screen.queryByRole('menuitem', { name: /sign out/i }),
    ).not.toBeInTheDocument();

    await clicker.click(screen.getByRole('button', { name: /amara okafor/i }));

    expect(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it('names the viewer and their role in the account menu', async () => {
    const clicker = userEvent.setup();
    renderShell();

    await clicker.click(screen.getByRole('button', { name: /amara okafor/i }));

    // NFR-2: spelled out rather than abbreviated.
    expect(await screen.findByText('OFFICE_ADMIN')).toBeInTheDocument();
  });
});

describe('AppShell navigation bands', () => {
  const nobody = {
    name: 'Office Administrator',
    role: 'OFFICE_ADMIN',
    permissions: {},
  };

  it('offers a menu button to reach the navigation on a phone', () => {
    // A permanent drawer on a phone leaves no room for the tables these
    // screens exist to show, so below sm the navigation is behind a button.
    renderShell(nobody);

    expect(
      screen.getByRole('button', { name: /open the navigation/i }),
    ).toBeInTheDocument();
  });

  /**
   * Which band is *visible* is decided by a CSS media query and MUI's Slide
   * transition, and jsdom evaluates neither — asserting on that would be
   * testing the framework rather than the product.
   *
   * What the product owes is that all three bands ship, and that each is built
   * from the one permission-gated list, so an `S-19` edit reaches the phone,
   * the tablet rail and the desktop drawer together. A plain DOM query answers
   * both, without depending on an accessibility tree jsdom collapses inside
   * `aria-hidden`.
   */
  it('ships all three bands, each built from the one permission-gated list', () => {
    renderShell(nobody);

    const bands = document.querySelectorAll('nav[aria-label="Modules"]');
    expect(bands).toHaveLength(3);

    // This viewer holds nothing, so each band offers Home and nothing else.
    for (const band of bands) {
      const labels = [...band.querySelectorAll('a')].map((link) =>
        link.getAttribute('aria-label'),
      );
      expect(labels).toEqual(['Home']);
    }
  });
});

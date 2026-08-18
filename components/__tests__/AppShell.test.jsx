import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import { PERMISSIONS } from '../../constants/index.js';
import { AppShell } from '../AppShell.jsx';

/**
 * Asserts what the shell offers a given viewer — never a colour, which belongs
 * in `app/__tests__/theme.test.js`.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const user = {
  name: 'Amara Okafor',
  role: 'OFFICE_ADMIN',
  permissions: { [PERMISSIONS.USER_READ]: 'ALL' },
};

const renderShell = () =>
  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <AppShell user={user} signOutAction={vi.fn()}>
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

  it('names the signed-in viewer and their role', () => {
    renderShell();

    expect(screen.getByText('Amara Okafor')).toBeInTheDocument();
    // NFR-2: spelled out rather than abbreviated.
    expect(screen.getByText('OFFICE_ADMIN')).toBeInTheDocument();
  });

  it('shows only the modules the viewer holds a permission for', () => {
    renderShell();

    // One reachable link, not two: the navigation is rendered into both
    // drawers, but the closed temporary one is aria-hidden and so is correctly
    // outside the accessibility tree.
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Audit' }),
    ).not.toBeInTheDocument();
  });
});

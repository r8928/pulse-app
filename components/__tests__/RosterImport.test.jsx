import { ThemeProvider } from '@mui/material/styles';
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import { RosterImport } from '../RosterImport.jsx';

/**
 * S-08's upload step. The sheet's shape is the one thing a reader cannot
 * discover by trying — a wrong heading rejects every row at once — so the
 * guide is offered before the file is chosen rather than after it fails.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const renderImport = () =>
  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <RosterImport teams={[]} shifts={[]} employmentTypes={[]} />
    </ThemeProvider>,
  );

describe('RosterImport', () => {
  it('explains the sheet format on arrival, before a file is chosen', () => {
    renderImport();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers the guide again after it has been dismissed', async () => {
    renderImport();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ok, I understand' }),
    );
    // The dialog leaves on a transition, so its absence is waited for.
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));

    await userEvent.click(
      screen.getByRole('button', { name: /what the sheet must look like/i }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

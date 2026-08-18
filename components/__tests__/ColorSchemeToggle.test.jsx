import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import { ColorSchemeToggle } from '../ColorSchemeToggle.jsx';

/**
 * Asserts the accessible name and the mode it moves to — never a colour, which
 * would belong in `app/__tests__/theme.test.js`.
 *
 * The control is a cycle rather than an on/off switch because there are three
 * states, and "follow the system" is the one a first-time visitor arrives in.
 * Collapsing it to a binary would strand anyone who wants their OS setting back
 * after touching the control once.
 */

const renderToggle = () =>
  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <ColorSchemeToggle />
    </ThemeProvider>,
  );

/** The hook persists to localStorage, so each test starts from a clean slate. */
beforeEach(() => {
  window.localStorage.clear();
});

describe('ColorSchemeToggle', () => {
  it('names the current mode in text, so the state is not carried by an icon alone', async () => {
    renderToggle();

    expect(
      await screen.findByRole('button', {
        name: /appearance: following your system/i,
      }),
    ).toBeInTheDocument();
  });

  it('switches to light when a viewer following the system activates it', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(await screen.findByRole('button'));

    expect(
      screen.getByRole('button', { name: /appearance: light/i }),
    ).toBeInTheDocument();
  });

  it('switches from light to dark, which is the mode this exists for', async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = await screen.findByRole('button');
    await user.click(button);
    await user.click(button);

    expect(
      screen.getByRole('button', { name: /appearance: dark/i }),
    ).toBeInTheDocument();
  });

  it('returns to following the system, so the choice is never a one-way door', async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = await screen.findByRole('button');
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(
      screen.getByRole('button', {
        name: /appearance: following your system/i,
      }),
    ).toBeInTheDocument();
  });

  it('remembers the chosen mode, so a reload does not discard it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderToggle();

    await user.click(await screen.findByRole('button'));
    unmount();
    renderToggle();

    expect(
      await screen.findByRole('button', { name: /appearance: light/i }),
    ).toBeInTheDocument();
  });
});

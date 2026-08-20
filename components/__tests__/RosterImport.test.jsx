import { ThemeProvider } from '@mui/material/styles';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import { RosterImport } from '../RosterImport.jsx';

/**
 * S-08's upload step. The sheet's shape is the one thing a reader cannot
 * discover by trying — a wrong heading rejects every row at once — so the
 * guide is offered before the file is chosen rather than after it fails.
 *
 * Step 2 is asserted at both widths, because it is one screen in two shapes
 * and the shape a phone gets is the one nobody looks at while building.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TEAMS = [{ _id: 't1', name: 'Engineering' }];
const SHIFTS = [{ _id: 's1', teamId: 't1', name: 'General' }];

/** One accepted row carrying only what the sheet actually supplies. */
const ACCEPTED = {
  sheetRow: 2,
  employeeCode: 'CB-1042',
  fullName: 'Sana Iqbal',
  workEmail: '',
  employmentType: '',
  dateOfJoining: '',
  role: null,
  tracked: null,
  loginEnabled: null,
};

/** Every field the sheet left for step 2 to ask about, as the reader sees them. */
const OUTSTANDING = 'Team, Employment type, Date of joining, Shift';

/**
 * `useMediaQuery` reads `window.matchMedia`, which jsdom answers `false` to for
 * everything. Forcing it is the only way to see the shape a phone is given.
 */
const stubViewport = (matches) => {
  vi.stubGlobal('matchMedia', (media) => ({
    matches,
    media,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
};

const renderImport = () =>
  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <RosterImport
        teams={TEAMS}
        shifts={SHIFTS}
        employmentTypes={['PERMANENT']}
      />
    </ThemeProvider>,
  );

/** Dismisses the arrival guide, uploads a sheet, and lands on step 2. */
const reachStepTwo = async (user) => {
  renderImport();

  await user.click(screen.getByRole('button', { name: 'Ok, I understand' }));
  await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));

  const chooser = screen.getByLabelText(/biometric id sheet/i);
  await user.upload(chooser, new File(['binary'], 'roster.xlsx'));

  /**
   * Submitted rather than clicked. `user-event` stands a `files` list on the
   * element with `defineProperty`, which jsdom's own constraint validation
   * never sees — so a `required` file input stays `valueMissing` and the click
   * on the submit button is swallowed by validation that would pass in a
   * browser. The submit itself is what this is testing around, not the button.
   */
  fireEvent.submit(chooser.closest('form'));

  await waitFor(() =>
    expect(screen.getByText('Sana Iqbal')).toBeInTheDocument(),
  );
};

describe('RosterImport', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: [ACCEPTED], rejected: [] }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains the sheet format on arrival, before a file is chosen', () => {
    renderImport();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers the guide again after it has been dismissed', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.click(screen.getByRole('button', { name: 'Ok, I understand' }));
    // The dialog leaves on a transition, so its absence is waited for.
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));

    await user.click(
      screen.getByRole('button', { name: /what the sheet must look like/i }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  describe('step 2, at table width', () => {
    it('names the two switches for what they do', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(
        screen.getByRole('columnheader', { name: 'Track time punches' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: 'Can log in' }),
      ).toBeInTheDocument();
    });

    it('names every control for the person it belongs to', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(
        screen.getByLabelText('Work email for Sana Iqbal'),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Track time punches for Sana Iqbal'),
      ).toBeInTheDocument();
    });

    it('names the outstanding fields as the labels name them', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(screen.getByText('4 outstanding')).toBeInTheDocument();
      expect(screen.getByTitle(OUTSTANDING)).toBeInTheDocument();
    });

    it('holds the commit until every row is complete', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(
        screen.getByRole('button', { name: /commit 1 user/i }),
      ).toBeDisabled();
    });
  });

  describe('step 2, at card width', () => {
    beforeEach(() => {
      stubViewport(true);
    });

    it('drops the table entirely rather than scrolling it sideways', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('gives every control its own visible label', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(screen.getByLabelText('Work email')).toBeInTheDocument();
      expect(screen.getByLabelText('Team')).toBeInTheDocument();
      expect(screen.getByLabelText('Track time punches')).toBeInTheDocument();
      expect(screen.getByLabelText('Can log in')).toBeInTheDocument();
    });

    it('says what each switch position actually means', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      // Tracked defaults on, login defaults off, so one of each is shown.
      expect(screen.getByText(/punches are recorded/i)).toBeInTheDocument();
      expect(screen.getByText(/they cannot sign in/i)).toBeInTheDocument();

      await user.click(screen.getByLabelText('Track time punches'));

      expect(
        screen.getByText(/no attendance is kept for them/i),
      ).toBeInTheDocument();
    });

    it('spells the outstanding fields out, having the room to', async () => {
      const user = userEvent.setup();
      await reachStepTwo(user);

      expect(
        screen.getByText(`Still needs ${OUTSTANDING}`),
      ).toBeInTheDocument();
    });
  });
});

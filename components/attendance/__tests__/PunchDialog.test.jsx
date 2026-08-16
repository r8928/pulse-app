import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PUNCH_TYPE } from '../../../constants/index.js';
import { PunchDialog } from '../PunchDialog.jsx';

/**
 * P-21. FR-4.12: a wrong punch is fixed by EDITING it — never by adding a
 * cancelling punch — and every fix is a manual adjustment under FR-4.10, so
 * it carries a reason.
 */

const existing = {
  _id: 'p1',
  at: new Date('2026-08-12T04:02:00Z'), // 09:02 in Asia/Karachi
  type: PUNCH_TYPE.CHECK_IN,
  version: 1,
};

const props = {
  userName: 'Aisha Khan',
  timezone: 'Asia/Karachi',
  workDate: '2026-08-12',
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  pending: false,
  error: null,
};

describe('PunchDialog', () => {
  it('names whose punch is being recorded', () => {
    render(<PunchDialog {...props} punch={null} />);

    expect(screen.getByText(/Aisha Khan/)).toBeInTheDocument();
  });

  it("pre-fills an existing punch with its own time, read in the shift's zone", () => {
    render(<PunchDialog {...props} punch={existing} />);

    expect(screen.getByLabelText(/time/i)).toHaveValue('09:02');
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-08-12');
  });

  it('submits the instant it was given, converted from the shift zone to UTC', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<PunchDialog {...props} punch={null} onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText(/time/i));
    await user.type(screen.getByLabelText(/time/i), '09:00');
    await user.click(screen.getByRole('button', { name: /record punch/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
      }),
    );
  });

  it('requires a reason to edit an existing punch, and says why', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<PunchDialog {...props} punch={existing} onSubmit={onSubmit} />);

    expect(
      screen.getByRole('button', { name: /save correction/i }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'Imported an hour out');
    expect(
      screen.getByRole('button', { name: /save correction/i }),
    ).toBeEnabled();
  });

  it('does not require a reason to record a new punch', () => {
    render(<PunchDialog {...props} punch={null} />);

    expect(screen.getByRole('button', { name: /record punch/i })).toBeEnabled();
  });

  it('closes without submitting when cancelled', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <PunchDialog
        {...props}
        punch={null}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a rejection rather than swallowing it', () => {
    render(
      <PunchDialog
        {...props}
        punch={null}
        error='2024-06-03 is outside their employment period.'
      />,
    );

    expect(
      screen.getByText(/outside their employment period/i),
    ).toBeInTheDocument();
  });

  it('disables the buttons while a write is in flight', () => {
    render(<PunchDialog {...props} punch={null} pending />);

    expect(
      screen.getByRole('button', { name: /record punch/i }),
    ).toBeDisabled();
  });

  it('offers both directions and no third option', () => {
    render(<PunchDialog {...props} punch={null} />);

    expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
  });
});

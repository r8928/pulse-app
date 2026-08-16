import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdjustHoursDialog } from '../AdjustHoursDialog.jsx';
import { DayStatusDialog } from '../DayStatusDialog.jsx';
import { WaiveDeductionDialog } from '../WaiveDeductionDialog.jsx';

/**
 * P-23, P-24, P-25. FR-6.11: the new value sits BESIDE the engine's, never in
 * place of it — so each dialog shows what the engine concluded, and each
 * demands a reason, because the why is as auditable as the what (FR-9.4).
 */

const record = {
  _id: 'd1',
  date: '2026-08-12',
  version: 3,
  computed: {
    dayStatus: 'WFO',
    workedMinutes: 360,
    lateMinutes: 120,
    deduction: 0.25,
    deductionRule: 'BR-9:band1',
  },
  override: null,
};

const props = {
  record,
  userName: 'Aisha Khan',
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  pending: false,
  error: null,
};

const leaveTypes = [{ name: 'Casual' }, { name: 'Sick' }];

describe('DayStatusDialog', () => {
  it("shows the engine's own status, so the reader sees what they are replacing", () => {
    render(<DayStatusDialog {...props} leaveTypes={leaveTypes} />);

    expect(screen.getByText(/worked in office/i)).toBeInTheDocument();
  });

  it('requires a reason before it will submit', async () => {
    const user = userEvent.setup();
    render(<DayStatusDialog {...props} leaveTypes={leaveTypes} />);

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'Approved WFH');
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('asks for the leave type only once LEAVE is chosen (D-9)', async () => {
    const user = userEvent.setup();
    render(<DayStatusDialog {...props} leaveTypes={leaveTypes} />);

    expect(screen.queryByLabelText(/leave type/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/new status/i));
    await user.click(screen.getByRole('option', { name: /on leave/i }));

    expect(screen.getByLabelText(/leave type/i)).toBeInTheDocument();
  });

  it('asks which half only for a half day (D-11)', async () => {
    const user = userEvent.setup();
    render(<DayStatusDialog {...props} leaveTypes={leaveTypes} />);

    await user.click(screen.getByLabelText(/new status/i));
    await user.click(screen.getByRole('option', { name: /on leave/i }));

    expect(screen.queryByLabelText(/which half/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/amount/i));
    await user.click(screen.getByRole('option', { name: /half day/i }));

    expect(screen.getByLabelText(/which half/i)).toBeInTheDocument();
  });

  it('submits leave as a leave record rather than as a bare status', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <DayStatusDialog
        {...props}
        leaveTypes={leaveTypes}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByLabelText(/new status/i));
    await user.click(screen.getByRole('option', { name: /on leave/i }));
    await user.type(screen.getByLabelText(/reason/i), 'Family matter');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        dayStatus: 'LEAVE',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Family matter',
      }),
    );
  });

  it('submits an ordinary status as an override, carrying the version', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <DayStatusDialog
        {...props}
        leaveTypes={leaveTypes}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByLabelText(/new status/i));
    await user.click(screen.getByRole('option', { name: /worked from home/i }));
    await user.type(screen.getByLabelText(/reason/i), 'Home internet outage');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dayStatus: 'WFH', version: 3 }),
    );
  });
});

describe('AdjustHoursDialog', () => {
  it('shows the duration the engine computed, read as hours and minutes', () => {
    render(<AdjustHoursDialog {...props} />);

    expect(screen.getByText('6h 00m')).toBeInTheDocument();
  });

  it('submits the corrected duration in minutes', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<AdjustHoursDialog {...props} onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText('Hours'));
    await user.type(screen.getByLabelText('Hours'), '8');
    await user.clear(screen.getByLabelText('Minutes'));
    await user.type(screen.getByLabelText('Minutes'), '30');
    await user.type(screen.getByLabelText(/reason/i), 'Terminal was down');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ workedMinutes: 510, version: 3 }),
    );
  });

  it('requires a reason', () => {
    render(<AdjustHoursDialog {...props} />);

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});

describe('WaiveDeductionDialog', () => {
  it('shows the deduction and the rule that produced it (FR-7.6)', () => {
    render(<WaiveDeductionDialog {...props} />);

    expect(screen.getByText(/0\.25/)).toBeInTheDocument();
    expect(screen.getByText(/BR-9:band1/)).toBeInTheDocument();
  });

  it('states that waiving makes the day compliant (BR-8)', () => {
    render(<WaiveDeductionDialog {...props} />);

    expect(screen.getAllByText(/counts as compliant/i).length).toBeGreaterThan(
      0,
    );
  });

  it('submits a deduction of zero rather than clearing the field', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<WaiveDeductionDialog {...props} onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/reason/i),
      'Traffic closure on the M9',
    );
    await user.click(screen.getByRole('button', { name: /waive/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ deduction: 0, version: 3 }),
    );
  });

  it('requires a reason, because a waiver is a decision', () => {
    render(<WaiveDeductionDialog {...props} />);

    expect(screen.getByRole('button', { name: /waive/i })).toBeDisabled();
  });

  it('shows a rejection rather than swallowing it', () => {
    render(
      <WaiveDeductionDialog
        {...props}
        error='This day changed since you loaded it.'
      />,
    );

    expect(
      screen.getByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
  });
});

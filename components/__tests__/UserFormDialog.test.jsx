import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserFormDialog } from '../UserFormDialog.jsx';

/**
 * P-08. Creating a user, with the team and shift `FR-2.1` puts in `IT`'s hands.
 *
 * The interesting rule is the one between the two fields. Shifts are per team
 * (`FR-3.3`), so there is no shift to choose before a team is chosen; and
 * `FR-3.4` requires a shift for a tracked user and leaves it optional for an
 * untracked one. Together those make the team optional in general and
 * required exactly when attendance is being tracked.
 */

const teams = [
  {
    _id: 't1',
    name: 'General',
    defaultShiftId: 's2',
    shifts: [
      { _id: 's1', name: 'Early', startTime: '08:00', endTime: '17:00' },
      { _id: 's2', name: 'Day', startTime: '09:00', endTime: '18:00' },
    ],
  },
  {
    _id: 't2',
    name: 'GC',
    defaultShiftId: null,
    shifts: [
      { _id: 's3', name: 'Night', startTime: '19:00', endTime: '04:00' },
    ],
  },
];

const props = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue(true),
  pending: false,
  error: null,
  employmentTypes: ['PERMANENT', 'CONTRACT'],
  teams,
};

const renderDialog = (overrides) =>
  render(<UserFormDialog {...props} {...overrides} />);

/** MUI renders a listbox in a portal; the option lives there, not in the field. */
const choose = async (comboboxName, optionName) => {
  await userEvent.click(screen.getByRole('combobox', { name: comboboxName }));
  await userEvent.click(
    within(screen.getByRole('listbox')).getByRole('option', {
      name: optionName,
    }),
  );
};

describe('UserFormDialog', () => {
  it('offers the teams a user may be created into', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('combobox', { name: /team/i }));

    const options = within(screen.getByRole('listbox'));
    expect(
      options.getByRole('option', { name: 'General' }),
    ).toBeInTheDocument();
    expect(options.getByRole('option', { name: 'GC' })).toBeInTheDocument();
  });

  it('has no shift to offer before a team is chosen', async () => {
    renderDialog();

    // Not merely empty — disabled, and saying why, because an enabled select
    // that opens onto nothing reads as a broken screen rather than an order
    // of operations (DC-6).
    expect(screen.getByRole('combobox', { name: /shift/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText(/choose a team first/i)).toBeInTheDocument();
  });

  it('fills the shift list from the chosen team alone', async () => {
    renderDialog();

    await choose(/team/i, 'GC');
    await userEvent.click(screen.getByRole('combobox', { name: /shift/i }));

    const options = within(screen.getByRole('listbox'));
    expect(options.getByRole('option', { name: /night/i })).toBeInTheDocument();
    // The other team's shifts are not on offer: a shift belongs to one team.
    expect(options.queryByRole('option', { name: /early/i })).toBeNull();
  });

  it("starts on the team's own default shift, which is what most joiners take", async () => {
    renderDialog();

    await choose(/team/i, 'General');

    expect(screen.getByRole('combobox', { name: /shift/i })).toHaveTextContent(
      /day/i,
    );
  });

  it('requires a team and a shift once attendance is tracked (FR-3.4)', () => {
    renderDialog();

    // 'Attendance tracked' defaults on, so this is the ordinary case.
    expect(screen.getByRole('combobox', { name: /team/i })).toBeRequired();
    expect(screen.getByRole('combobox', { name: /shift/i })).toBeRequired();
  });

  it('leaves both optional for an untracked user (FR-2.10)', async () => {
    renderDialog();

    await userEvent.click(screen.getByLabelText(/attendance tracked/i));

    expect(screen.getByRole('combobox', { name: /team/i })).not.toBeRequired();
    expect(screen.getByRole('combobox', { name: /shift/i })).not.toBeRequired();
  });

  it('forgets a shift belonging to the team just moved away from', async () => {
    renderDialog();

    await choose(/team/i, 'General');
    await choose(/shift/i, /early/i);
    await choose(/team/i, 'GC');

    // 'Early' belongs to General. Carrying it into GC would submit a shift
    // from another team, which FR-3.3 does not allow to exist.
    expect(
      screen.getByRole('combobox', { name: /shift/i }),
    ).not.toHaveTextContent(/early/i);
  });

  it('hands the chosen team and shift to the caller', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    renderDialog({ onSubmit });

    await userEvent.type(screen.getByLabelText(/full name/i), 'Rosa Delgado');
    await userEvent.type(screen.getByLabelText(/employee code/i), 'BIO-114');
    await userEvent.type(
      screen.getByLabelText(/date of joining/i),
      '2026-01-05',
    );
    await choose(/employment type/i, 'PERMANENT');
    await choose(/team/i, 'General');
    await choose(/shift/i, /early/i);

    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 't1', shiftId: 's1' }),
    );
  });

  /**
   * FR-3.14 makes a team move `OFFICE_ADMIN`'s own operation carrying its own
   * reason, exactly as a role change is. Offering it here as an ordinary field
   * would be a second, unaudited way to do it.
   */
  it('does not offer team or shift when editing an existing user', () => {
    renderDialog({
      initial: {
        fullName: 'Rosa Delgado',
        employeeCode: 'BIO-114',
        employmentType: 'PERMANENT',
        dateOfJoining: '2026-01-05',
        tracked: true,
        loginEnabled: true,
      },
    });

    expect(screen.queryByRole('combobox', { name: /team/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /shift/i })).toBeNull();
  });
});

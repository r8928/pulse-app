import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ROLES } from '../../constants/index.js';
import { UserDetail } from '../UserDetail.jsx';

/**
 * S-07. One user's whole record.
 *
 * Role, team and shift are separate actions rather than fields on the edit
 * form, because FR-2.1 makes each a separate decision — and each carries a
 * mandatory reason the ordinary edit does not.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const user = {
  _id: 'u1',
  fullName: 'Alice Adeyemi',
  employeeCode: 'EMP-001',
  workEmail: 'alice@example.com',
  employmentType: 'PERMANENT',
  role: ROLES.EMPLOYEE,
  teamId: 't1',
  shiftId: 's1',
  tracked: true,
  loginEnabled: true,
  dateOfJoining: '2026-01-05',
  dateOfLeaving: null,
  deletedAt: null,
  version: 1,
  tenures: [
    {
      _id: 'ten1',
      startDate: '2026-01-05',
      endDate: null,
      deletedAt: null,
      version: 1,
    },
  ],
};

const props = {
  user,
  history: [],
  teams: [{ _id: 't1', name: 'General', managerId: null }],
  shifts: [{ _id: 's1', name: 'Day 09:00', timezone: 'Asia/Karachi' }],
  colleagues: [{ _id: 'u2', fullName: 'Bob Brand' }],
  shiftAssignments: [
    {
      _id: 'sa1',
      shiftId: 's1',
      effectiveFrom: '2026-01-05',
      effectiveTo: null,
    },
  ],
  teamAssignments: [],
  canWrite: true,
};

describe('UserDetail', () => {
  it('offers role, team and shift as separate actions from the edit form', () => {
    render(<UserDetail {...props} />);

    for (const label of [
      /^edit$/i,
      /change role/i,
      /move team/i,
      /assign shift/i,
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    }
  });

  it('labels the tracking and login toggles by what pressing them will do', () => {
    render(<UserDetail {...props} />);

    expect(
      screen.getByRole('button', { name: /stop tracking/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /disable login/i }),
    ).toBeEnabled();
  });

  it('flips those labels for a user who is already untracked and locked out', () => {
    render(
      <UserDetail
        {...props}
        user={{ ...user, tracked: false, loginEnabled: false }}
      />,
    );

    expect(
      screen.getByRole('button', { name: /start tracking/i }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /enable login/i })).toBeEnabled();
  });

  it('hides every write control from a viewer without user.write', () => {
    render(<UserDetail {...props} canWrite={false} />);

    expect(screen.queryByRole('button', { name: /change role/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /soft delete/i })).toBeNull();
  });

  it('offers restore instead of the edit actions for a departed user', () => {
    render(
      <UserDetail
        {...props}
        user={{ ...user, deletedAt: '2026-07-01T00:00:00.000Z' }}
      />,
    );

    expect(screen.getByRole('button', { name: /restore/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /change role/i })).toBeNull();

    // list-of-screens.md: the status chip *and* a persistent banner, because
    // FR-2.4 means the record still appears everywhere and must say why.
    expect(screen.getAllByText(/no longer active/i)).toHaveLength(2);
  });

  it('shows a shift assignment as a dated range rather than a current value', async () => {
    // FR-3.6: a past date is judged by the shift that covered it.
    render(<UserDetail {...props} />);
    await userEvent.click(
      screen.getByRole('tab', { name: 'Shift assignments' }),
    );

    expect(screen.getByText('2026-01-05')).toBeInTheDocument();
    expect(screen.getByText('— open')).toBeInTheDocument();
    expect(screen.getByText(/in force today/i)).toBeInTheDocument();
  });

  it('sends the leave tab to the ledger, where balances are replayed', async () => {
    // DC-4: a balance is never stored, so it lives on the screen that shows
    // the movements producing it rather than being copied onto this one.
    render(<UserDetail {...props} />);
    await userEvent.click(
      screen.getByRole('tab', { name: 'Leave and balances' }),
    );

    expect(
      screen.getByRole('link', { name: /open balance history/i }),
    ).toHaveAttribute('href', '/leave/u1/ledger');
  });

  it('disables soft deleting the only tenure a user has', async () => {
    // FR-2.12: every user always keeps at least one that is not soft deleted.
    render(<UserDetail {...props} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Tenures' }));

    expect(
      screen.getByRole('button', {
        name: /soft delete the tenure starting 2026-01-05/i,
      }),
    ).toBeDisabled();
  });

  it('lists this user’s recent days, each linking to that day’s detail', async () => {
    const dayRecords = [
      {
        _id: 'd1',
        date: '2026-08-12',
        dayType: 'WORKING',
        computed: {
          dayStatus: 'WFO',
          workedMinutes: 482,
          deduction: 0,
        },
        override: null,
      },
    ];
    render(<UserDetail {...props} dayRecords={dayRecords} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Attendance' }));

    expect(screen.getByText('8h 02m')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2026-08-12' })).toHaveAttribute(
      'href',
      '/attendance/u1/2026-08-12',
    );
  });

  it('says the attendance tab is empty rather than rendering a bare table', async () => {
    render(<UserDetail {...props} dayRecords={[]} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Attendance' }));

    expect(screen.getByText(/no day records yet/i)).toBeInTheDocument();
  });
});

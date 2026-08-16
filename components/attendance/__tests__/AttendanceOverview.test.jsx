import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceOverview } from '../AttendanceOverview.jsx';

/**
 * S-09. Attendance statistics for every employee over a chosen date range —
 * a read surface, filterable down to a single person including the viewer.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const rows = [
  {
    userId: 'u1',
    fullName: 'Aisha Khan',
    employeeCode: 'E-001',
    deletedAt: null,
    present: 18,
    absent: 1,
    wfh: 3,
    leave: 2,
    holidayWork: 1,
    lateDays: 4,
    shortDays: 2,
    leaveByType: { Casual: 1, Sick: 1 },
  },
];

const props = {
  rows,
  teams: [{ _id: 't1', name: 'General' }],
  leaveTypes: ['Casual', 'Sick'],
  filters: {
    from: '2026-08-01',
    to: '2026-08-31',
    teamId: '',
    userId: '',
    includeDeleted: false,
  },
  untrackedCount: 0,
};

describe('AttendanceOverview', () => {
  it('shows each total against the person it belongs to', () => {
    render(<AttendanceOverview {...props} />);

    expect(screen.getByText('Aisha Khan')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('breaks leave down by type, one column each (FR-5.7)', () => {
    render(<AttendanceOverview {...props} />);

    expect(
      screen.getByRole('columnheader', { name: /casual/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /sick/i }),
    ).toBeInTheDocument();
  });

  it('states that untracked colleagues are excluded (FR-2.10)', () => {
    render(<AttendanceOverview {...props} untrackedCount={2} />);

    expect(screen.getByText(/2 untracked/i)).toBeInTheDocument();
  });

  it('stays silent about untracked colleagues when there are none', () => {
    render(<AttendanceOverview {...props} />);

    expect(screen.queryByText(/untracked/i)).not.toBeInTheDocument();
  });

  it('marks a departed colleague and still shows their figures (FR-2.4)', () => {
    const departed = [{ ...rows[0], deletedAt: '2026-08-20T00:00:00.000Z' }];
    render(<AttendanceOverview {...props} rows={departed} />);

    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('says the PTO balance arrives with the ledger rather than showing a zero (D-19)', () => {
    render(<AttendanceOverview {...props} />);

    expect(screen.getByText(/with the balances screen/i)).toBeInTheDocument();
  });

  it('says a range with no records is empty rather than rendering a bare table', () => {
    render(<AttendanceOverview {...props} rows={[]} />);

    expect(
      screen.getByText(/no attendance in this range/i),
    ).toBeInTheDocument();
  });

  it('offers a just-me filter, so the screen works as a personal view', () => {
    // MVP criterion 4: narrowing attendance.read to SELF on S-19 turns this
    // into a personal view with no code change.
    render(<AttendanceOverview {...props} viewerId='u1' />);

    expect(
      screen.getByRole('button', { name: /just me/i }),
    ).toBeInTheDocument();
  });
});

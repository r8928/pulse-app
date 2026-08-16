import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceGrid } from '../AttendanceGrid.jsx';

/**
 * S-10. One team, one date, the write surface — built so a single day's
 * correction takes three clicks or fewer from S-04 (NFR-1).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const shift = {
  _id: 's1',
  name: 'Days',
  timezone: 'Asia/Karachi',
  requiredDailyMinutes: 540,
};

const worked = {
  user: { _id: 'u1', fullName: 'Aisha Khan', employeeCode: 'E-001' },
  shift,
  dayRecord: {
    _id: 'd1',
    date: '2026-08-12',
    version: 1,
    dayType: 'WORKING',
    computed: {
      dayStatus: 'WFO',
      workedMinutes: 482,
      lateMinutes: 2,
      deduction: 0,
      deductionRule: null,
    },
    override: null,
    exceptions: [],
  },
  punches: [
    {
      _id: 'p1',
      type: 'CHECK_IN',
      at: '2026-08-12T04:02:00.000Z',
      isDuplicate: false,
      deletedAt: null,
    },
    {
      _id: 'p2',
      type: 'CHECK_OUT',
      at: '2026-08-12T13:04:00.000Z',
      isDuplicate: false,
      deletedAt: null,
    },
  ],
};

const absent = {
  user: { _id: 'u2', fullName: 'Chen Wei', employeeCode: 'E-002' },
  shift,
  dayRecord: {
    _id: 'd2',
    date: '2026-08-12',
    version: 1,
    dayType: 'WORKING',
    computed: {
      dayStatus: 'ABSENT',
      workedMinutes: 0,
      lateMinutes: 0,
      deduction: 1,
      deductionRule: 'BR-9:did-not-attend',
    },
    override: null,
    exceptions: [],
  },
  punches: [],
};

const props = {
  teams: [{ _id: 't1', name: 'General' }],
  teamId: 't1',
  date: '2026-08-12',
  canWrite: true,
  leaveTypes: [{ name: 'Casual' }],
  untrackedCount: 0,
};

describe('AttendanceGrid', () => {
  it('shows a worked day with its punch pair and duration', () => {
    render(<AttendanceGrid {...props} rows={[worked]} />);

    expect(screen.getByText('Aisha Khan')).toBeInTheDocument();
    expect(screen.getByText('E-001')).toBeInTheDocument();
    expect(screen.getByText('09:02 → 18:04')).toBeInTheDocument();
    expect(screen.getByText('8h 02m')).toBeInTheDocument();
  });

  it('shows an absence with the deduction the ladder produced and its rule', () => {
    render(<AttendanceGrid {...props} rows={[absent]} />);

    expect(screen.getByText(/absent/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('BR-9:did-not-attend')).toBeInTheDocument();
  });

  it('states that untracked colleagues are excluded rather than leaving it silent (FR-2.10)', () => {
    render(<AttendanceGrid {...props} rows={[worked]} untrackedCount={3} />);

    expect(screen.getByText(/3 untracked/i)).toBeInTheDocument();
  });

  it('says nothing about untracked colleagues when there are none', () => {
    render(<AttendanceGrid {...props} rows={[worked]} untrackedCount={0} />);

    expect(screen.queryByText(/untracked/i)).not.toBeInTheDocument();
  });

  it('shows an empty status and names the missing shift rather than guessing (FR-3.12)', () => {
    const noShift = {
      ...worked,
      shift: null,
      dayRecord: {
        ...worked.dayRecord,
        shiftId: null,
        exceptions: ['NO_SHIFT_ASSIGNED'],
      },
    };
    render(<AttendanceGrid {...props} rows={[noShift]} />);

    expect(screen.getByText(/no shift assigned/i)).toBeInTheDocument();
  });

  it('marks a value an administrator overrode', () => {
    const overridden = {
      ...worked,
      dayRecord: {
        ...worked.dayRecord,
        override: {
          dayStatus: 'WFH',
          reason: 'Outage',
          actorName: 'Office Administrator',
        },
      },
    };
    render(<AttendanceGrid {...props} rows={[overridden]} />);

    expect(screen.getByText(/worked from home/i)).toBeInTheDocument();
    expect(screen.getByText(/set by an administrator/i)).toBeInTheDocument();
  });

  it('flags a row carrying an exception', () => {
    const flagged = {
      ...worked,
      punches: [worked.punches[0]],
      dayRecord: { ...worked.dayRecord, exceptions: ['MISSING_CHECK_OUT'] },
    };
    render(<AttendanceGrid {...props} rows={[flagged]} />);

    expect(screen.getByText(/missing check out/i)).toBeInTheDocument();
  });

  it('shows a check-in with no counterpart as unclosed rather than as zero', () => {
    const unclosed = {
      ...worked,
      punches: [worked.punches[0]],
      dayRecord: { ...worked.dayRecord, exceptions: ['MISSING_CHECK_OUT'] },
    };
    render(<AttendanceGrid {...props} rows={[unclosed]} />);

    expect(screen.getByText('09:02 → —')).toBeInTheDocument();
  });

  it('offers no row actions to a viewer who may only read', () => {
    render(<AttendanceGrid {...props} rows={[worked]} canWrite={false} />);

    expect(
      screen.queryByRole('button', { name: /actions for aisha khan/i }),
    ).not.toBeInTheDocument();
  });

  it('offers row actions to a viewer who may write', () => {
    render(<AttendanceGrid {...props} rows={[worked]} />);

    expect(
      screen.getByRole('button', { name: /actions for aisha khan/i }),
    ).toBeInTheDocument();
  });

  it('says why a date has no rows rather than rendering an empty table', () => {
    render(<AttendanceGrid {...props} rows={[]} />);

    expect(screen.getByText(/no tracked member/i)).toBeInTheDocument();
  });

  it('links each row to that day’s detail', () => {
    render(<AttendanceGrid {...props} rows={[worked]} />);

    expect(screen.getByRole('link', { name: /aisha khan/i })).toHaveAttribute(
      'href',
      '/attendance/u1/2026-08-12',
    );
  });
});

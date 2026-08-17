import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeaveBalances } from '../LeaveBalances.jsx';

/**
 * S-13. Typed balances per user, every figure replayed from the ledger and
 * never stored (DC-4), and every one of them a link to the entries that
 * produced it (NFR-11).
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
    byType: {
      Annual: {
        opening: 2,
        credited: 10,
        availed: 3,
        deductions: 0.25,
        ctoApplied: 0,
        balance: 8.75,
      },
      Paternity: {
        opening: 0,
        credited: 0,
        availed: 5,
        deductions: 0,
        ctoApplied: 0,
        balance: -5,
      },
    },
    wfhUsed: 2,
  },
];

const props = {
  rows,
  teams: [{ _id: 't1', name: 'General' }],
  leaveTypes: ['Annual', 'Paternity'],
  wfhQuota: 5,
  filters: { from: '2026-01-01', to: '2026-12-31', teamId: '', userId: '' },
  canWrite: true,
};

describe('LeaveBalances', () => {
  it('shows the movements behind a balance, not just the balance (BR-14)', () => {
    render(<LeaveBalances {...props} />);

    expect(screen.getByText('8.75')).toBeInTheDocument();

    // The movements read as one line beneath the balance, so the reader sees
    // what produced it without leaving the screen.
    expect(
      screen.getByText(/opening 2 · credited 10 · availed 3 · deducted 0\.25/),
    ).toBeInTheDocument();
  });

  it('gives each leave type its own balance (FR-6.2, FR-6.9)', () => {
    render(<LeaveBalances {...props} />);

    expect(
      screen.getByRole('columnheader', { name: /annual/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /paternity/i }),
    ).toBeInTheDocument();
  });

  it('shows the WFH quota and what is left of it (FR-5.5, BR-16)', () => {
    render(<LeaveBalances {...props} />);

    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument();
  });

  it('links every figure to the ledger that produced it (NFR-11)', () => {
    render(<LeaveBalances {...props} />);

    expect(screen.getByRole('link', { name: /aisha khan/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/leave/u1/ledger'),
    );
  });

  it('marks a colleague who has left and keeps their figures (FR-2.4)', () => {
    const departed = [{ ...rows[0], deletedAt: '2026-08-20T00:00:00.000Z' }];
    render(<LeaveBalances {...props} rows={departed} />);

    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.getByText('8.75')).toBeInTheDocument();
  });

  it('says an empty range is empty rather than rendering a bare table', () => {
    render(<LeaveBalances {...props} rows={[]} />);

    expect(screen.getByText(/no balances in this range/i)).toBeInTheDocument();
  });

  it('offers the cutover opening balance only to someone who may write', () => {
    render(<LeaveBalances {...props} canWrite={false} />);

    expect(
      screen.queryByRole('button', { name: /opening balance/i }),
    ).not.toBeInTheDocument();
  });
});

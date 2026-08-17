import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedgerTrace } from '../LedgerTrace.jsx';

/**
 * S-14. Read only by design — nothing here can be edited or deleted, because
 * a movement is cancelled only by a reversing entry appended elsewhere
 * (FR-6.8). This is the proof behind every number the app displays.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const entries = [
  {
    _id: 'l0',
    date: '2026-01-01',
    entryType: 'OPENING_BALANCE',
    leaveType: 'Casual',
    amount: 2,
    rule: 'MANUAL_GRANT',
    actorName: 'Office Administrator',
    reason: 'Carried from the 2025 workbook',
    reversalOf: null,
    runningBalance: 2,
  },
  {
    _id: 'l1',
    date: '2026-01-01',
    entryType: 'ENTITLEMENT_CREDIT',
    leaveType: 'Casual',
    amount: 10,
    rule: 'BR-12',
    actorName: 'Pulse engine',
    reason: 'Annual entitlement for 2026',
    reversalOf: null,
    runningBalance: 12,
  },
  {
    _id: 'l2',
    date: '2026-03-04',
    entryType: 'AUTOMATIC_DEDUCTION',
    leaveType: 'Casual',
    amount: -0.25,
    rule: 'BR-9:band1',
    actorName: 'Pulse engine',
    reason: null,
    reversalOf: null,
    runningBalance: 11.75,
  },
  {
    _id: 'l3',
    date: '2026-03-05',
    entryType: 'REVERSAL',
    leaveType: 'Casual',
    amount: 0.25,
    rule: 'BR-9:band1',
    actorName: 'Office Administrator',
    reason: 'Waived under BR-8',
    reversalOf: 'l2',
    runningBalance: 12,
  },
];

const props = {
  user: { _id: 'u1', fullName: 'Aisha Khan', employeeCode: 'E-001' },
  entries,
  hasOpeningBalance: true,
  leaveTypes: ['Casual'],
  filters: { leaveType: '' },
};

describe('LedgerTrace', () => {
  it('shows every movement with its running balance', () => {
    render(<LedgerTrace {...props} />);

    expect(screen.getByText('11.75')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('-0.25')).toBeInTheDocument();
  });

  it('names the rule that produced each movement (FR-7.6)', () => {
    render(<LedgerTrace {...props} />);

    expect(screen.getAllByText('BR-9:band1').length).toBeGreaterThan(0);
    expect(screen.getByText('BR-12')).toBeInTheDocument();
  });

  it('marks a reversal as cancelling an earlier movement', () => {
    render(<LedgerTrace {...props} />);

    expect(
      screen.getByText(/cancels an earlier movement/i),
    ).toBeInTheDocument();
  });

  it('labels the opening balance as entered at cutover (FR-6.13)', () => {
    render(<LedgerTrace {...props} />);

    expect(screen.getByText(/entered at cutover/i)).toBeInTheDocument();
  });

  it('shows who made each movement and why', () => {
    render(<LedgerTrace {...props} />);

    expect(screen.getByText(/waived under br-8/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pulse engine/i).length).toBeGreaterThan(0);
  });

  it('offers no way to change anything, anywhere (FR-6.8)', () => {
    render(<LedgerTrace {...props} />);

    for (const label of [/edit/i, /delete/i, /remove/i]) {
      expect(
        screen.queryByRole('button', { name: label }),
      ).not.toBeInTheDocument();
    }
  });

  it('says a user has no opening entry rather than showing a zero row', () => {
    render(
      <LedgerTrace
        {...props}
        entries={entries.slice(1)}
        hasOpeningBalance={false}
      />,
    );

    expect(screen.getByText(/no opening balance/i)).toBeInTheDocument();
  });

  it('says an empty ledger is empty', () => {
    render(<LedgerTrace {...props} entries={[]} hasOpeningBalance={false} />);

    expect(screen.getByText(/no movements yet/i)).toBeInTheDocument();
  });
});

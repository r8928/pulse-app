import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeavePersonPicker } from '../LeavePersonPicker.jsx';

/**
 * Page 3's front door for a viewer whose leave permission reaches more than
 * themselves.
 *
 * Someone scoped to SELF never reaches this — `proxy.js` sends them to their
 * own history — so everything here assumes a choice worth making.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const props = {
  people: [
    {
      _id: 'u1',
      fullName: 'Aisha Khan',
      employeeCode: 'CB-001',
      teamName: 'General',
      noLongerActive: false,
    },
    {
      _id: 'u2',
      fullName: 'Bilal Ahmed',
      employeeCode: 'CB-002',
      teamName: 'Design',
      noLongerActive: true,
    },
  ],
  teams: [{ _id: 't1', name: 'General' }],
  filters: { teamId: '' },
  leaveTypes: ['Annual', 'Sick'],
  canWrite: true,
};

describe('LeavePersonPicker', () => {
  it('sends every colleague to their own balance history', () => {
    render(<LeavePersonPicker {...props} />);

    expect(screen.getByRole('link', { name: 'Aisha Khan' })).toHaveAttribute(
      'href',
      '/leave/u1/ledger',
    );
  });

  it('marks a colleague who has left rather than hiding them (FR-2.4)', () => {
    render(<LeavePersonPicker {...props} />);

    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
  });

  it('narrows the list as the reader types', async () => {
    const user = userEvent.setup();
    render(<LeavePersonPicker {...props} />);

    await user.type(screen.getByLabelText(/search/i), 'bilal');

    expect(screen.queryByText('Aisha Khan')).not.toBeInTheDocument();
    expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument();
  });

  it('matches on the employee code as well as the name', async () => {
    const user = userEvent.setup();
    render(<LeavePersonPicker {...props} />);

    await user.type(screen.getByLabelText(/search/i), 'CB-002');

    expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument();
  });

  it('says so when nothing matches rather than rendering a bare table', async () => {
    const user = userEvent.setup();
    render(<LeavePersonPicker {...props} />);

    await user.type(screen.getByLabelText(/search/i), 'zzz');

    expect(screen.getByText(/no colleague matches/i)).toBeVisible();
  });

  it('offers the cutover opening balance only to someone who may write (P-19)', () => {
    render(<LeavePersonPicker {...props} canWrite={false} />);

    expect(
      screen.queryByRole('button', { name: /opening balance/i }),
    ).not.toBeInTheDocument();
  });

  it('offers it to someone who may (FR-6.13)', () => {
    render(<LeavePersonPicker {...props} />);

    expect(
      screen.getByRole('button', { name: /opening balance/i }),
    ).toBeInTheDocument();
  });
});

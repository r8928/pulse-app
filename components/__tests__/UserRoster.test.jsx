import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserRoster } from '../UserRoster.jsx';

/**
 * S-06. Asserts what the roster offers a given viewer.
 *
 * The import link matters more than it looks. `S-08` was built, routed and
 * permission-gated, and nothing linked to it — so the one screen the go-live
 * migration depends on was reachable only by typing its URL.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const users = [
  {
    _id: '1',
    fullName: 'Amara Okafor',
    employeeCode: 'CB-0142',
    role: 'EMPLOYEE',
    employmentType: 'PERMANENT',
    dateOfJoining: '2024-02-01',
    dateOfLeaving: null,
    phone: '+92 300 1234567',
    deletedAt: null,
  },
];

const props = {
  users,
  total: 1,
  activeCount: 1,
  canWrite: true,
  canImport: true,
  employmentTypes: ['PERMANENT'],
};

describe('UserRoster', () => {
  it('offers the workbook import to a viewer who holds user.import', () => {
    render(<UserRoster {...props} />);

    expect(
      screen.getByRole('link', { name: /import from workbook/i }),
    ).toHaveAttribute('href', '/users/import');
  });

  it('hides the import from a viewer without user.import', () => {
    render(<UserRoster {...props} canImport={false} />);

    expect(
      screen.queryByRole('link', { name: /import from workbook/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the create action from a viewer without user.write', () => {
    render(<UserRoster {...props} canWrite={false} />);

    expect(
      screen.queryByRole('button', { name: /new user/i }),
    ).not.toBeInTheDocument();
  });

  it('points an empty roster at the import rather than at a terminal command', () => {
    // The empty state used to tell whoever reached it to run `npm run seed`,
    // which is not a thing an office administrator can do.
    render(<UserRoster {...props} users={[]} total={0} activeCount={0} />);

    // Offered twice on purpose: once in the header for consistency with the
    // populated roster, and once in the empty state, which is where someone
    // who has just arrived is actually looking.
    expect(
      screen.getAllByRole('link', { name: /import from workbook/i }),
    ).toHaveLength(2);
    expect(screen.queryByText(/npm run seed/i)).not.toBeInTheDocument();
  });
});

/**
 * The phone numbers.
 *
 * There is no per-column permission behind this and there deliberately is not
 * one: the whole screen is administration. `proxy.js` sends a colleague whose
 * `user.read` reaches only themselves to their own profile and answers 404 for
 * everybody else's, so the only people who ever render this table are the ones
 * allowed to read every number in it.
 */
describe('UserRoster — phone numbers', () => {
  it('shows the number the record carries', () => {
    render(<UserRoster {...props} />);

    expect(
      screen.getByRole('columnheader', { name: /phone/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('+92 300 1234567')).toBeInTheDocument();
  });

  it('leaves the cell empty for a colleague who has none', () => {
    // Optional means optional. An em dash or "unknown" would read as a fact
    // about them rather than as an unanswered field.
    const noPhone = [{ ...users[0], phone: null }];
    render(<UserRoster {...props} users={noPhone} />);

    expect(screen.queryByText('+92 300 1234567')).not.toBeInTheDocument();
    expect(screen.getByText('Amara Okafor')).toBeInTheDocument();
  });
});

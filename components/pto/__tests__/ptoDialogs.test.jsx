import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApproveDialog } from '../ApproveDialog.jsx';
import { DeclineDialog } from '../DeclineDialog.jsx';
import { OriginateDialog } from '../OriginateDialog.jsx';
import { OverrideExpiryDialog } from '../OverrideExpiryDialog.jsx';

/**
 * P-01 to P-04 and P-27.
 *
 * `FR-7.2`: the ladder decided what was PROPOSED, never what may be approved.
 * So every approval dialog names the rule and the proposed figure, and then
 * lets the approver enter something else entirely — including a figure no
 * ladder row produces.
 */

const award = {
  _id: 'a1',
  date: '2026-08-15',
  rule: 'BR-19',
  proposedAmount: 1,
  approvedAmount: null,
  expiresAt: '2026-09-14',
  expiryExtended: false,
  status: 'PENDING',
  version: 1,
};

const application = {
  _id: 'c1',
  date: '2026-08-16',
  rule: 'BR-23',
  proposedAmount: 0.5,
  appliedAmount: null,
  blockOverridden: false,
  status: 'PENDING',
  version: 1,
};

const props = {
  userName: 'Aisha Khan',
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  pending: false,
  error: null,
};

describe('ApproveDialog', () => {
  it('names the ladder row and the amount it proposed (P-01)', () => {
    render(<ApproveDialog {...props} kind='PTO' candidate={award} />);

    expect(screen.getByText('BR-19')).toBeInTheDocument();
    expect(screen.getByText(/1 day/i)).toBeInTheDocument();
  });

  it('accepts an amount no ladder row produces (FR-7.2)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ApproveDialog
        {...props}
        onSubmit={onSubmit}
        kind='PTO'
        candidate={award}
      />,
    );

    const amount = screen.getByLabelText(/amount to approve/i);
    await user.clear(amount);
    await user.type(amount, '0.3');
    await user.type(screen.getByLabelText(/reason/i), 'Agreed with the lead');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0.3, version: 1 }),
    );
  });

  it('will not submit without a reason (FR-9.4)', async () => {
    const user = userEvent.setup();
    render(<ApproveDialog {...props} kind='PTO' candidate={award} />);

    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'Confirmed');
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });

  it('offers the BR-26 balance override on a CTO application, and only there (P-02)', () => {
    const { unmount } = render(
      <ApproveDialog {...props} kind='PTO' candidate={award} />,
    );
    expect(
      screen.queryByLabelText(/insufficient pto/i),
    ).not.toBeInTheDocument();
    unmount();

    render(<ApproveDialog {...props} kind='CTO' candidate={application} />);
    expect(screen.getByLabelText(/insufficient pto/i)).toBeInTheDocument();
  });

  it('sends the override only when it was explicitly ticked (BR-26, FR-6.10)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ApproveDialog
        {...props}
        onSubmit={onSubmit}
        kind='CTO'
        candidate={application}
      />,
    );

    await user.type(screen.getByLabelText(/reason/i), 'Approved anyway');
    await user.click(screen.getByLabelText(/insufficient pto/i));
    await user.click(screen.getByRole('button', { name: /apply cto/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ override: true }),
    );
  });
});

describe('DeclineDialog', () => {
  it('states that nothing will post and shows what is being turned down (P-03)', () => {
    render(<DeclineDialog {...props} kind='PTO' candidate={award} />);

    expect(screen.getByText('BR-19')).toBeInTheDocument();
    expect(screen.getByText(/nothing is posted/i)).toBeInTheDocument();
  });

  it('will not submit without a reason (FR-7.8)', async () => {
    const user = userEvent.setup();
    render(<DeclineDialog {...props} kind='PTO' candidate={award} />);

    expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'Already compensated');
    expect(screen.getByRole('button', { name: /decline/i })).toBeEnabled();
  });
});

describe('OriginateDialog', () => {
  const people = [
    { _id: 'u1', fullName: 'Aisha Khan' },
    { _id: 'u2', fullName: 'Bilal Ahmed' },
  ];

  it('submits a colleague, a date, an amount and a reason (P-04, FR-7.7)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OriginateDialog
        {...props}
        onSubmit={onSubmit}
        kind='PTO'
        people={people}
      />,
    );

    await user.type(screen.getByLabelText(/amount/i), '1');
    await user.type(screen.getByLabelText(/reason/i), 'Site outage, no punch');
    await user.click(screen.getByRole('button', { name: /grant/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', amount: 1 }),
    );
  });

  it('says the grant will be identified as manual in the ledger (FR-7.6)', () => {
    render(<OriginateDialog {...props} kind='PTO' people={people} />);

    expect(screen.getByText(/manual grant/i)).toBeInTheDocument();
  });
});

describe('OverrideExpiryDialog', () => {
  it('shows the expiry it is replacing, so the reader sees what changes (P-27)', () => {
    render(<OverrideExpiryDialog {...props} award={award} />);

    expect(screen.getByText('2026-09-14')).toBeInTheDocument();
  });

  it('will not submit without a reason', async () => {
    const user = userEvent.setup();
    render(<OverrideExpiryDialog {...props} award={award} />);

    expect(
      screen.getByRole('button', { name: /change expiry/i }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'Extended by agreement');
    expect(
      screen.getByRole('button', { name: /change expiry/i }),
    ).toBeEnabled();
  });

  it('carries the new date and the version it was decided against', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OverrideExpiryDialog {...props} onSubmit={onSubmit} award={award} />,
    );

    // A date input is set rather than typed into: jsdom rejects the partial
    // values a keystroke-by-keystroke `type` would produce.
    fireEvent.change(screen.getByLabelText(/new expiry/i), {
      target: { value: '2027-06-01' },
    });
    await user.type(screen.getByLabelText(/reason/i), 'Extended by agreement');
    await user.click(screen.getByRole('button', { name: /change expiry/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: '2027-06-01', version: 1 }),
    );
  });
});

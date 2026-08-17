import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MANUAL_GRANT } from '../../../constants/index.js';
import { PtoCandidates } from '../PtoCandidates.jsx';

/**
 * S-15. Every PTO award and CTO application at every stage: suggested,
 * approved, declined, expired.
 *
 * The point of the whole branch is visible here: a suggested row is a
 * proposal and nothing more (`FR-7.1`), and the ladder row that produced it
 * stays readable beside the figure a human actually decided on, so "why is
 * this number what it is" is answerable without leaving the screen (NFR-11).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const pending = {
  _id: 'a1',
  userId: 'u1',
  fullName: 'Aisha Khan',
  employeeCode: 'E-001',
  date: '2026-08-15',
  rule: 'BR-19',
  proposedAmount: 1,
  approvedAmount: null,
  expiresAt: null,
  expiryExtended: false,
  status: 'PENDING',
  actorName: null,
  reason: null,
  version: 1,
};

const approved = {
  ...pending,
  _id: 'a2',
  userId: 'u2',
  fullName: 'Bilal Ahmed',
  employeeCode: 'E-002',
  rule: 'BR-18',
  proposedAmount: 0.5,
  approvedAmount: 0.75,
  expiresAt: '2026-09-14',
  expiryExtended: true,
  status: 'APPROVED',
  actorName: 'Office Administrator',
  reason: 'Confirmed with the team lead',
  version: 2,
};

const application = {
  _id: 'c1',
  userId: 'u1',
  fullName: 'Aisha Khan',
  employeeCode: 'E-001',
  date: '2026-08-16',
  rule: 'BR-23',
  proposedAmount: 0.5,
  appliedAmount: 0.5,
  blockOverridden: true,
  status: 'APPROVED',
  actorName: 'Office Administrator',
  reason: 'Approved anyway',
  version: 2,
};

const props = {
  awards: [pending, approved],
  applications: [application],
  teams: [{ _id: 't1', name: 'General' }],
  people: [{ _id: 'u1', fullName: 'Aisha Khan' }],
  filters: { from: '2026-08-01', to: '2026-08-31', teamId: '', userId: '' },
  canApprove: true,
  today: '2026-08-20',
};

const showEveryStatus = async (user) => {
  await user.click(screen.getByLabelText(/status/i));
  await user.click(screen.getByRole('option', { name: /every status/i }));
};

describe('PtoCandidates', () => {
  it('offers approve and decline on a suggested award, which has posted nothing yet', () => {
    render(<PtoCandidates {...props} />);

    expect(screen.getByRole('button', { name: /^approve$/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeEnabled();
  });

  it('shows the approved figure and the ladder row that produced it (NFR-11)', async () => {
    const user = userEvent.setup();
    render(<PtoCandidates {...props} />);
    await showEveryStatus(user);

    expect(screen.getByText('0.75')).toBeInTheDocument();
    expect(screen.getByText('BR-18')).toBeInTheDocument();
  });

  it('names a manual grant rather than showing a rule code nobody can look up (FR-7.6)', async () => {
    const user = userEvent.setup();
    const manual = { ...approved, _id: 'a3', rule: MANUAL_GRANT };
    render(<PtoCandidates {...props} awards={[manual]} />);
    await showEveryStatus(user);

    expect(screen.getByText(/manual grant/i)).toBeInTheDocument();
    expect(screen.queryByText(MANUAL_GRANT)).not.toBeInTheDocument();
  });

  it('marks an expiry that was extended, because the extension is part of the record (FR-7.3)', async () => {
    const user = userEvent.setup();
    render(<PtoCandidates {...props} />);
    await showEveryStatus(user);

    expect(screen.getByText(/extended/i)).toBeInTheDocument();
  });

  it('shows CTO applications with the BR-26 block marked where it was overridden', async () => {
    const user = userEvent.setup();
    render(<PtoCandidates {...props} />);

    await user.click(screen.getByRole('tab', { name: /cto/i }));
    await showEveryStatus(user);

    expect(screen.getByText('BR-23')).toBeInTheDocument();
    expect(screen.getByText(/balance block overridden/i)).toBeInTheDocument();
  });

  it('shows the table but no decision controls to a viewer without pto.approve', () => {
    render(<PtoCandidates {...props} canApprove={false} />);

    expect(screen.getByText('Aisha Khan')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^approve$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^decline$/i }),
    ).not.toBeInTheDocument();
  });

  it('offers P-04 origination even when the engine raised nothing at all', () => {
    render(<PtoCandidates {...props} awards={[]} applications={[]} />);

    expect(
      screen.getByRole('button', { name: /grant pto manually/i }),
    ).toBeEnabled();
  });

  it('says no candidate was ever raised, which is not the same as all decided', () => {
    render(<PtoCandidates {...props} awards={[]} applications={[]} />);

    expect(
      screen.getByText(/no pto award has been raised/i),
    ).toBeInTheDocument();
  });

  it('says every candidate has been decided when some exist but none is waiting', () => {
    render(<PtoCandidates {...props} awards={[approved]} />);

    expect(screen.getByText(/already been decided/i)).toBeInTheDocument();
  });

  it('shows expired as the stage it is, not as a date the reader must compare', async () => {
    // S-15 lists expired among the stages it shows. The award document has no
    // EXPIRED status — the ledger sweep is what makes it real (D-24) — so the
    // stage is read off the date against today, which the server supplies so
    // the client never has to ask for a clock.
    const user = userEvent.setup();
    const expired = { ...approved, expiresAt: '2026-08-01' };
    render(<PtoCandidates {...props} awards={[expired]} today='2026-08-20' />);
    await showEveryStatus(user);

    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });

  it('does not call an award expired while its date is still ahead', async () => {
    const user = userEvent.setup();
    render(<PtoCandidates {...props} awards={[approved]} today='2026-08-20' />);
    await showEveryStatus(user);

    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
  });

  it('offers the expiry override only on an approved award (P-27)', async () => {
    const user = userEvent.setup();
    render(<PtoCandidates {...props} />);
    await showEveryStatus(user);

    // One approved award in the set, so exactly one expiry control.
    expect(screen.getAllByRole('button', { name: /expiry/i })).toHaveLength(1);
  });
});

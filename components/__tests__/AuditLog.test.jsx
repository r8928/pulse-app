import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../AuditLog.jsx';

/**
 * S-22 and the shell's mobile treatment.
 *
 * The audit assertions are about what a reader can see and reach — never about
 * a design token, which belongs in `app/__tests__/theme.test.js`.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/audit',
  useSearchParams: () => new URLSearchParams(),
}));

const records = [
  {
    _id: 'a1',
    at: '2026-08-13T09:00:00.000Z',
    actorName: 'Office Administrator',
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: 'u1',
    reason: 'New joiner',
    before: null,
    after: { fullName: 'Alice Adeyemi' },
  },
];

const props = {
  records,
  total: 1,
  page: 1,
  pageSize: 50,
  actions: ['USER_CREATED'],
  entityTypes: ['user'],
};

describe('AuditLog', () => {
  it('shows the time, actor, action, entity and reason of each change', () => {
    render(<AuditLog {...props} />);

    expect(screen.getByText('Office Administrator')).toBeInTheDocument();
    expect(screen.getByText('USER_CREATED')).toBeInTheDocument();
    expect(screen.getByText('New joiner')).toBeInTheDocument();
  });

  it('offers no edit or delete anywhere, because no endpoint provides one', () => {
    // FR-9.3, and the reason the screen is trustworthy at all.
    render(<AuditLog {...props} />);

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('opens one record and shows before and after side by side', async () => {
    // FR-9.2: the whole documents, never a diff.
    render(<AuditLog {...props} />);
    await userEvent.click(
      screen.getByRole('button', { name: /open the record from/i }),
    );

    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getByText(/Alice Adeyemi/)).toBeInTheDocument();
  });

  it('explains an empty result as too-narrow filters, not as nothing happening', () => {
    // The log is never empty in practice — the seed and every mutation write.
    render(<AuditLog {...props} records={[]} total={0} />);

    expect(
      screen.getByText(/no record matches these filters/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clear the filters/i }),
    ).toBeEnabled();
  });

  it('offers only the actions and entity types actually in the log', () => {
    render(<AuditLog {...props} />);

    expect(
      screen.getByRole('combobox', { name: /action/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /entity type/i }),
    ).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell.jsx';
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

describe('AppShell on a phone', () => {
  const user = {
    name: 'Office Administrator',
    role: 'OFFICE_ADMIN',
    permissions: {},
  };

  it('offers a menu button to reach the navigation', () => {
    // DESIGN.md's known gap: a 232px permanent drawer leaves a phone no room
    // for the tables these screens exist to show.
    render(
      <AppShell user={user} signOutAction={() => {}}>
        <p>Content</p>
      </AppShell>,
    );

    expect(
      screen.getByRole('button', { name: /open the navigation/i }),
    ).toBeInTheDocument();
  });

  /**
   * Which drawer is *visible* is decided by a CSS media query and MUI's Slide
   * transition, and jsdom evaluates neither — asserting on that would be
   * testing the framework rather than the product.
   *
   * What the product owes is that a second drawer ships at all, and that both
   * are built from the one permission-gated list so an `S-19` edit reaches the
   * phone and the desktop together. A plain DOM query answers both, without
   * depending on an accessibility tree jsdom collapses inside `aria-hidden`.
   */
  it('ships a temporary drawer beside the permanent one, both permission-gated', () => {
    render(
      <AppShell user={user} signOutAction={() => {}}>
        <p>Content</p>
      </AppShell>,
    );

    const drawers = document.querySelectorAll('nav[aria-label="Modules"]');
    expect(drawers).toHaveLength(2);

    // This viewer holds nothing, so each drawer offers Home and nothing else.
    for (const drawer of drawers) {
      const labels = [...drawer.querySelectorAll('a')].map((link) =>
        link.textContent.trim(),
      );
      expect(labels).toEqual(['Home']);
    }
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXCEPTION_QUEUE } from '../../../constants/index.js';
import { ExceptionsDashboard } from '../ExceptionsDashboard.jsx';

/**
 * `S-05`. The single work queue: everything needing attention surfaces here
 * and nowhere else (`FR-8.6`).
 *
 * Two rules the spec is explicit about and which nothing else enforces:
 * **every tab carries its count**, and an empty one reads *"Nothing
 * outstanding"* rather than rendering an empty grid — a blank table is
 * indistinguishable from a broken one.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const counts = Object.fromEntries(
  Object.values(EXCEPTION_QUEUE).map((queue) => [queue, 0]),
);

const props = {
  counts: { ...counts, [EXCEPTION_QUEUE.MISSING_PUNCH]: 3 },
  filters: { from: '2026-01-01', to: '2026-12-31' },
  canDecide: true,
  canImport: true,
  people: [{ _id: 'u1', fullName: 'Aisha Khan' }],
};

const answer = (body) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

describe('ExceptionsDashboard', () => {
  beforeEach(() => {
    global.fetch = answer({ items: [], total: 0 });
  });

  it('shows all twelve queues, so nothing needing attention is hidden', () => {
    render(<ExceptionsDashboard {...props} />);

    expect(screen.getAllByRole('tab')).toHaveLength(12);
  });

  it('carries the count on the tab, which is how a queue gets noticed', () => {
    render(<ExceptionsDashboard {...props} />);

    expect(
      screen.getByRole('tab', { name: /missing check in or check out.*3/i }),
    ).toBeInTheDocument();
  });

  it('says "Nothing outstanding" rather than rendering an empty grid', async () => {
    render(<ExceptionsDashboard {...props} />);

    await waitFor(() =>
      expect(screen.getByText(/nothing outstanding/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('fetches the queue it is showing, paged (NFR-3)', async () => {
    render(<ExceptionsDashboard {...props} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = global.fetch.mock.calls.at(-1)[0];
    expect(url).toContain(`queue=${EXCEPTION_QUEUE.MISSING_PUNCH}`);
    expect(url).toContain('pageSize=');
  });

  it('fetches the newly selected queue when a tab is chosen', async () => {
    const user = userEvent.setup();
    render(<ExceptionsDashboard {...props} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: /duplicate punch/i }));

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain(
        `queue=${EXCEPTION_QUEUE.DUPLICATE_PUNCH}`,
      ),
    );
  });

  it('renders the rows a queue returns', async () => {
    global.fetch = answer({
      items: [
        {
          id: 'd1',
          userId: 'u1',
          userName: 'Aisha Khan',
          employeeCode: 'E-001',
          date: '2026-08-12',
          codes: ['MISSING_CHECK_OUT'],
          version: 1,
        },
      ],
      total: 1,
    });

    render(<ExceptionsDashboard {...props} />);

    await waitFor(() =>
      expect(screen.getByText('Aisha Khan')).toBeInTheDocument(),
    );
    expect(screen.getByText('2026-08-12')).toBeInTheDocument();
  });

  it("offers P-04's origination from here too (§27.3)", () => {
    render(<ExceptionsDashboard {...props} />);

    expect(
      screen.getByRole('button', { name: /grant pto manually/i }),
    ).toBeEnabled();
  });

  it('offers no decision controls to a viewer who cannot decide', () => {
    render(<ExceptionsDashboard {...props} canDecide={false} />);

    expect(
      screen.queryByRole('button', { name: /grant pto manually/i }),
    ).not.toBeInTheDocument();
  });

  it('states an error against the queue rather than blanking the page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'That queue could not be read.' }),
    });

    render(<ExceptionsDashboard {...props} />);

    await waitFor(() =>
      expect(screen.getByText(/could not be read/i)).toBeInTheDocument(),
    );
    // The tabs survive: one failing queue must not take the other eleven down.
    expect(screen.getAllByRole('tab')).toHaveLength(12);
  });
});

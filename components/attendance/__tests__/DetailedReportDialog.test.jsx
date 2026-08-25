import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERIOD_MODE } from '../../../constants/index.js';
import { DetailedReportDialog } from '../DetailedReportDialog.jsx';

/**
 * The consuming half of `/api/attendance/day-by-day`'s contract.
 *
 * `CLAUDE.md` asks for both halves: the route fulfils the shape and the client
 * consumes that same shape. `__tests__/api.dayByDay.test.js` is the other end
 * of this — a change to either is only done when both are updated together.
 */

const day = (date, overrides = {}) => ({
  date,
  weekday: 'Monday',
  dayType: 'WORKING',
  dayStatus: 'WFO',
  checkIn: null,
  checkOut: null,
  workedMinutes: 0,
  timezone: 'Asia/Karachi',
  leaveUsed: 0,
  leaveAwarded: 0,
  leaveBalance: 12,
  inEmploymentPeriod: true,
  ...overrides,
});

const people = [
  {
    userId: 'u1',
    fullName: 'Aisha Khan',
    employeeCode: 'CB-001',
    noLongerActive: false,
    days: [
      day('2026-08-17', {
        checkIn: '2026-08-17T04:12:00.000Z',
        checkOut: '2026-08-17T13:04:00.000Z',
        workedMinutes: 532,
      }),
      day('2026-08-18'),
      day('2026-08-19', { leaveUsed: 1, leaveBalance: 11 }),
    ],
  },
];

const props = {
  open: true,
  onClose: vi.fn(),
  period: {
    mode: PERIOD_MODE.MONTHLY,
    anchor: '2026-08-01',
    from: '2026-08-01',
    to: '2026-08-31',
  },
  filters: { teamId: 't1', userId: '' },
};

const answersWith = (body, ok = true) =>
  vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });

describe('DetailedReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the period and filters the summary is showing', async () => {
    global.fetch = answersWith({
      people,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    render(<DetailedReportDialog {...props} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [url] = global.fetch.mock.calls.at(-1);
    // The popup is the detail of the table behind it, so the two cannot show
    // different periods.
    expect(url).toContain('/api/attendance/day-by-day');
    expect(url).toContain('from=2026-08-01');
    expect(url).toContain('to=2026-08-31');
    expect(url).toContain('teamId=t1');
  });

  it('renders a block per colleague and a row per date', async () => {
    global.fetch = answersWith({
      people,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    render(<DetailedReportDialog {...props} />);

    expect(await screen.findByText('Aisha Khan')).toBeVisible();
    expect(screen.getByText('Mon, 17 Aug')).toBeInTheDocument();
    // The date nothing was recorded on is still a row.
    expect(screen.getByText('Tue, 18 Aug')).toBeInTheDocument();
  });

  it('reads a punch in the timezone of its shift (§7.2)', async () => {
    global.fetch = answersWith({
      people,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    render(<DetailedReportDialog {...props} />);

    // 04:12 UTC is 09:12 in Karachi.
    expect(await screen.findByText('09:12')).toBeInTheDocument();
  });

  it('offers a way out that does not depend on finding the backdrop', async () => {
    const onClose = vi.fn();
    global.fetch = answersWith({
      people,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    render(<DetailedReportDialog {...props} onClose={onClose} />);

    await user().click(
      await screen.findByRole('button', { name: /close the detailed report/i }),
    );

    expect(onClose).toHaveBeenCalled();
  });

  it('says what went wrong rather than showing an empty sheet', async () => {
    global.fetch = answersWith({ error: 'That range is too wide.' }, false);
    render(<DetailedReportDialog {...props} />);

    expect(await screen.findByText(/that range is too wide/i)).toBeVisible();
  });

  it('says so when the filter reaches nobody', async () => {
    global.fetch = answersWith({ people: [], from: 'x', to: 'y' });
    render(<DetailedReportDialog {...props} />);

    expect(await screen.findByText(/nobody in this period/i)).toBeVisible();
  });

  it('asks for nothing at all while it is closed', () => {
    global.fetch = answersWith({ people, from: 'x', to: 'y' });
    render(<DetailedReportDialog {...props} open={false} />);

    // A month of a whole team is a large read; paying for it on every visit to
    // the summary would be a cost the reader never asked for.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

const user = () => userEvent.setup();

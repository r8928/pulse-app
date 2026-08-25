import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERIOD_MODE } from '../../../constants/index.js';
import { AttendanceSummary } from '../AttendanceSummary.jsx';

/**
 * Page 1, the merge of `S-09`, `S-13` and `S-20`.
 *
 * Every assertion here was a claim one of those three screens made about
 * itself. They are gathered rather than rewritten on purpose: the merge is
 * only safe if nothing a reader relied on quietly stopped being true, and the
 * way to know that is to keep asking the same questions of the new screen.
 */

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const balances = (overrides = {}) => ({
  opening: 2,
  credited: 10,
  availed: 3,
  deductions: 0.25,
  ctoApplied: 0,
  balance: 8.75,
  ...overrides,
});

const rows = [
  {
    userId: 'u1',
    fullName: 'Aisha Khan',
    employeeCode: 'CB-001',
    noLongerActive: false,
    workingDays: 21,
    holidays: 1,
    present: 20,
    absent: 1,
    wfh: 2,
    lateDays: 3,
    shortDays: 0,
    holidayWork: 1,
    checkedInMinutes: 8880,
    expectedMinutes: 9120,
    approvedLeaveMinutes: 480,
    pto: 2,
    leaveByType: { Casual: 1 },
    balancesByType: { Annual: balances(), Casual: balances({ balance: 4 }) },
    wfhQuota: 5,
  },
  {
    userId: 'u2',
    fullName: 'Bilal Ahmed',
    employeeCode: 'CB-002',
    noLongerActive: false,
    workingDays: 21,
    holidays: 1,
    present: 10,
    absent: 11,
    wfh: 0,
    lateDays: 0,
    shortDays: 2,
    holidayWork: 0,
    checkedInMinutes: 4800,
    expectedMinutes: 9120,
    approvedLeaveMinutes: 0,
    pto: 0,
    leaveByType: {},
    balancesByType: { Annual: balances({ balance: 1 }) },
    wfhQuota: null,
  },
];

const props = {
  rows,
  teams: [{ _id: 't1', name: 'General' }],
  people: [{ _id: 'u1', fullName: 'Aisha Khan' }],
  leaveTypes: ['Annual', 'Casual'],
  period: {
    mode: PERIOD_MODE.MONTHLY,
    anchor: '2026-08-01',
    from: '2026-08-01',
    to: '2026-08-31',
  },
  filters: { teamId: '', userId: '', groups: null },
  untrackedCount: 2,
  canExport: true,
  canFilterPeople: true,
  viewerId: 'u1',
};

describe('AttendanceSummary', () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['a,b']),
      json: async () => ({}),
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:x');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('shows the working days beside what the person actually did (FR-3.9)', () => {
    render(<AttendanceSummary {...props} />);

    expect(
      screen.getByRole('columnheader', { name: /working days/i }),
    ).toBeInTheDocument();
    // 21 working days is a sentence next to 20 present; 20 alone is not.
    expect(screen.getAllByText('21').length).toBeGreaterThan(0);
  });

  it('states the untracked exclusion rather than leaving it silent (FR-2.10)', () => {
    render(<AttendanceSummary {...props} />);

    expect(screen.getByText(/2 untracked colleagues/i)).toBeInTheDocument();
  });

  it('marks a departed colleague and keeps their totals (FR-2.4)', () => {
    const departed = [{ ...rows[0], noLongerActive: true }];
    render(<AttendanceSummary {...props} rows={departed} />);

    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.getAllByText('20').length).toBeGreaterThan(0);
  });

  it('gives each leave type its own group (FR-5.7, FR-6.2)', () => {
    render(<AttendanceSummary {...props} />);

    expect(
      screen.getByRole('columnheader', { name: /^annual$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /^casual$/i }),
    ).toBeInTheDocument();
  });

  it('opens with a leave type collapsed to its balance alone', () => {
    render(<AttendanceSummary {...props} />);

    expect(screen.getByText('8.75')).toBeInTheDocument();
    // The six figures behind it are one chevron away, not on screen by default
    // — thirty-two columns do not fit the tablet this is sized for.
    expect(
      screen.queryByRole('columnheader', { name: /credited/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the movements behind a balance when the group is expanded (BR-14)', async () => {
    const user = userEvent.setup();
    render(<AttendanceSummary {...props} />);

    await user.click(screen.getByRole('button', { name: /expand annual/i }));

    // The expansion is a URL change, so the view is shareable as a link.
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining('groups=leave%3ACasual'),
    );
  });

  it('links every balance to the ledger that produced it (NFR-11)', () => {
    render(<AttendanceSummary {...props} />);

    const [link] = screen.getAllByRole('link', { name: '8.75' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/leave/u1/ledger'),
    );
  });

  it('reads the hours as hours and minutes, never as a decimal', () => {
    render(<AttendanceSummary {...props} />);

    // "148.03 hours" is not a figure anyone can check against a timesheet.
    expect(screen.getByText('148h 00m')).toBeInTheDocument();
    expect(screen.getAllByText('152h 00m').length).toBe(2);
  });

  it('shows the approved leave that was netted off the expectation', () => {
    render(<AttendanceSummary {...props} />);

    expect(
      screen.getByRole('columnheader', { name: /approved leave/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('8h 00m')).toBeInTheDocument();
  });

  it('exports the report as currently filtered (P-43, FR-8.5)', async () => {
    const user = userEvent.setup();
    render(<AttendanceSummary {...props} />);

    await user.click(screen.getByRole('button', { name: /csv/i }));

    const [url, init] = global.fetch.mock.calls.at(-1);
    expect(url).toBe('/api/reports/export');

    const body = JSON.parse(init.body);
    expect(body.format).toBe('csv');
    // The rows on screen, not a fresh query that might disagree with them.
    expect(body.rows).toHaveLength(2);
  });

  it('exports every column even where a group is collapsed on screen', async () => {
    const user = userEvent.setup();
    render(<AttendanceSummary {...props} />);

    await user.click(screen.getByRole('button', { name: /csv/i }));

    const body = JSON.parse(global.fetch.mock.calls.at(-1)[1].body);
    const keys = body.columns.map((column) => column.key);

    // A collapsed group is a reading convenience. A file missing the figures
    // behind it would be a different report from the one the sender thought
    // they were sending.
    expect(keys).toContain('leave:Annual:credited');
  });

  it('offers no export to someone who does not hold report.build (FR-8.1)', () => {
    render(<AttendanceSummary {...props} canExport={false} />);

    expect(
      screen.queryByRole('button', { name: /csv/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the team and colleague filters from a viewer scoped to themselves', () => {
    // An EMPLOYEE with attendance.read at SELF sees one row: their own. A team
    // filter would be a control that cannot change anything.
    render(<AttendanceSummary {...props} canFilterPeople={false} />);

    expect(
      screen.queryByRole('combobox', { name: /team/i }),
    ).not.toBeInTheDocument();
  });

  it('shows WFH used against the monthly quota it is capped by (BR-16)', () => {
    render(<AttendanceSummary {...props} />);

    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });

  it('drops the ratio for a period that is not a month, keeping the quota in words', () => {
    // A week's usage against a monthly quota reads as a fraction and is not
    // one. The count stands alone; the ceiling is said in words on hover.
    render(
      <AttendanceSummary
        {...props}
        period={{
          mode: PERIOD_MODE.WEEKLY,
          anchor: '2026-08-17',
          from: '2026-08-17',
          to: '2026-08-23',
        }}
      />,
    );

    expect(screen.queryByText('2 of 5')).not.toBeInTheDocument();
    expect(screen.getByTitle(/5 work-from-home days a month/i)).toBeVisible();
  });

  it('states a plain count where no quota is configured (DC-6)', () => {
    render(<AttendanceSummary {...props} rows={[rows[1]]} />);

    // An unconfigured ceiling is stated as unknown by its absence, never
    // guessed at.
    expect(screen.queryByText(/^\d+ of \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/work-from-home days a month/i)).toBeNull();
  });

  it('says an empty period is empty rather than rendering a bare table', () => {
    render(<AttendanceSummary {...props} rows={[]} />);

    expect(screen.getByText(/nothing recorded in this period/i)).toBeVisible();
  });

  it('offers a colleague’s year from their row (FR-8.4)', () => {
    render(<AttendanceSummary {...props} />);

    expect(
      screen.getByRole('link', { name: /open aisha khan's year/i }),
    ).toHaveAttribute('href', expect.stringContaining('/attendance/annual'));
  });
});

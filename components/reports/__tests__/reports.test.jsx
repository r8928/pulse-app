import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnualSummary } from '../AnnualSummary.jsx';
import { ReportBuilder } from '../ReportBuilder.jsx';

/**
 * `S-20` and `S-21`, and the four things §30.1 says the screens must get
 * right:
 *
 * - untracked colleagues are excluded **and the exclusion is stated**;
 * - a soft-deleted colleague appears with unchanged totals, **marked**;
 * - `S-21` includes **every** month — workbook defect `F1`;
 * - a month outside the employment period is marked as such rather than
 *   shown as absence, which is a different claim entirely.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const rows = [
  {
    userId: 'u1',
    fullName: 'Aisha Khan',
    employeeCode: 'E-001',
    workingDays: 22,
    holidays: 1,
    present: 21,
    absent: 1,
    wfh: 3,
    leave: 0,
    lateDays: 2,
    shortDays: 1,
    holidayWork: 0,
    pto: 1.5,
    leaveByType: { Casual: 1 },
    noLongerActive: false,
  },
  {
    userId: 'u2',
    fullName: 'Bilal Ahmed',
    employeeCode: 'E-002',
    workingDays: 22,
    holidays: 1,
    present: 10,
    absent: 0,
    wfh: 0,
    leave: 0,
    lateDays: 0,
    shortDays: 0,
    holidayWork: 0,
    pto: 0,
    leaveByType: {},
    noLongerActive: true,
  },
];

const builderProps = {
  rows,
  teams: [{ _id: 't1', name: 'General' }],
  people: [{ _id: 'u1', fullName: 'Aisha Khan' }],
  leaveTypes: ['Casual'],
  untrackedCount: 2,
  filters: { from: '2026-08-01', to: '2026-08-31', teamId: '', userId: '' },
};

const months = Array.from({ length: 12 }, (_unused, index) => ({
  month: index + 1,
  label: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][index],
  inEmploymentPeriod: index >= 5,
  workingDays: index >= 5 ? 22 : 0,
  holidays: 0,
  present: index === 7 ? 20 : 0,
  absent: 0,
  wfh: 0,
  leave: 0,
  lateDays: 0,
  shortDays: 0,
  holidayWork: 0,
}));

const summaryProps = {
  summary: {
    user: { _id: 'u1', fullName: 'Aisha Khan', employeeCode: 'E-001' },
    year: 2026,
    months,
    pto: 2,
  },
  people: [{ _id: 'u1', fullName: 'Aisha Khan' }],
  filters: { userId: 'u1', year: '2026' },
};

describe('ReportBuilder', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['a,b']),
      json: async () => ({}),
    });
  });

  it('shows the working days beside what the person actually did (FR-3.9)', () => {
    render(<ReportBuilder {...builderProps} />);

    expect(
      screen.getByRole('columnheader', { name: /working days/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
  });

  it('states the untracked exclusion rather than leaving it silent (FR-2.10)', () => {
    render(<ReportBuilder {...builderProps} />);

    expect(screen.getByText(/2 untracked colleagues/i)).toBeInTheDocument();
  });

  it('marks a departed colleague and keeps their totals (FR-2.4)', () => {
    render(<ReportBuilder {...builderProps} />);

    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('gives each leave type its own column (FR-5.7)', () => {
    render(<ReportBuilder {...builderProps} />);

    expect(
      screen.getByRole('columnheader', { name: /casual/i }),
    ).toBeInTheDocument();
  });

  it('exports the report as currently filtered (P-43, FR-8.5)', async () => {
    const user = userEvent.setup();
    render(<ReportBuilder {...builderProps} />);

    await user.click(screen.getByRole('button', { name: /export csv/i }));

    const [url, init] = global.fetch.mock.calls.at(-1);
    expect(url).toBe('/api/reports/export');
    const body = JSON.parse(init.body);
    expect(body.format).toBe('csv');
    // The rows on screen, not a fresh query that might disagree with them.
    expect(body.rows).toHaveLength(2);
  });

  it('says an empty range is empty rather than rendering a bare table', () => {
    render(<ReportBuilder {...builderProps} rows={[]} />);

    expect(screen.getByText(/nobody to report on/i)).toBeInTheDocument();
  });
});

describe('AnnualSummary', () => {
  it('includes every month, which is the whole of defect F1 (FR-8.4)', () => {
    render(<AnnualSummary {...summaryProps} />);

    for (const label of ['January', 'June', 'December']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders a month with no data as an explicit zero row', () => {
    render(<AnnualSummary {...summaryProps} />);

    const july = screen.getByText('July').closest('tr');
    // A real row with real figures, not a blank the reader has to interpret.
    expect(july).toHaveTextContent('22');
    expect(july).toHaveTextContent('0');
  });

  it('marks a month outside the employment period rather than as absence', () => {
    render(<AnnualSummary {...summaryProps} />);

    const january = screen.getByText('January').closest('tr');
    expect(january).toHaveTextContent(/not employed/i);
  });

  it('names the colleague and the year', () => {
    render(<AnnualSummary {...summaryProps} />);

    // Name AND year together: the name alone also sits in the employee
    // picker, so matching that would pass on the filter rather than the title.
    expect(screen.getByText(/aisha khan · 2026/i)).toBeInTheDocument();
  });
});

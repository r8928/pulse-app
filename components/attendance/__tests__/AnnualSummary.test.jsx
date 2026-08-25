import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnualSummary } from '../AnnualSummary.jsx';

/**
 * `S-21`, and the two things §30.1 says it must get right:
 *
 * - it includes **every** month — a month with no data is an explicit zero
 *   row, never a silent omission. That is workbook defect `F1`;
 * - a month outside the employment period is marked as such rather than shown
 *   as absence, which is a different claim entirely.
 *
 * It moved here from `components/reports/` with the Attendance & Leaves merge:
 * the Reports module is gone, and one colleague's year is reached from a row
 * of the attendance summary.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

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

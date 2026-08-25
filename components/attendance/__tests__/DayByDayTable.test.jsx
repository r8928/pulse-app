import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DayByDayTable } from '../DayByDayTable.jsx';

/**
 * Page 2's day-by-day view.
 *
 * The claim it exists to make is that it is CONTINUOUS: every date in the
 * period, worked or not. A view assembled from only the records that exist
 * cannot show a gap, and the gap is what a reader came for.
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
      day('2026-08-20', { leaveAwarded: 1, leaveBalance: 12 }),
    ],
  },
];

describe('DayByDayTable', () => {
  it('gives every date in the period a row, worked or not', () => {
    render(<DayByDayTable people={people} />);

    expect(screen.getByText('Mon, 17 Aug')).toBeInTheDocument();
    // Nothing was recorded on the 18th. It is still a row, because a date with
    // nothing on it is a fact rather than the absence of one.
    expect(screen.getByText('Tue, 18 Aug')).toBeInTheDocument();
  });

  it('writes the name once and spans it down the block, as the workbook does', () => {
    render(<DayByDayTable people={people} />);

    expect(screen.getAllByRole('link', { name: /aisha khan/i })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole('link', { name: /aisha khan/i }).closest('td'),
    ).toHaveAttribute('rowspan', '4');
  });

  it('reads a punch in the timezone of the shift it belongs to (§7.2)', () => {
    render(<DayByDayTable people={people} />);

    // 04:12 UTC is 09:12 in Karachi. Showing the reader's own zone would put a
    // night shift on the wrong side of midnight for anyone viewing elsewhere.
    expect(screen.getByText('09:12')).toBeInTheDocument();
    expect(screen.getByText('18:04')).toBeInTheDocument();
  });

  it('says nothing rather than midnight where a punch is missing (FR-4.8)', () => {
    render(<DayByDayTable people={people} />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows the leave taken and the balance it left behind', () => {
    render(<DayByDayTable people={people} />);

    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('marks a date outside the employment period rather than calling it absence', () => {
    const departed = [
      {
        ...people[0],
        days: [day('2026-08-17', { inEmploymentPeriod: false })],
      },
    ];
    render(<DayByDayTable people={departed} />);

    // Defect F1's lesson: not employed is a different claim from not present.
    expect(screen.getByText(/not employed/i)).toBeInTheDocument();
  });

  it('says so when nobody is selected rather than rendering a bare table', () => {
    render(<DayByDayTable people={[]} />);

    expect(screen.getByText(/nobody selected/i)).toBeVisible();
  });
});

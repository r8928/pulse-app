import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamConfiguration } from '../TeamConfiguration.jsx';

/**
 * S-17. One team's complete policy, across six tabs.
 *
 * The assertions are about which values are shown, which gaps are named and
 * which controls a viewer is offered — never about a design token.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const configuration = {
  team: {
    _id: 't1',
    name: 'General',
    managerId: null,
    defaultShiftId: null,
    deletedAt: null,
    version: 1,
  },
  shifts: [
    {
      _id: 's1',
      name: 'Day 09:00 to 18:00',
      startTime: '09:00',
      endTime: '18:00',
      requiredDailyMinutes: 540,
      graceMinutes: 30,
      timezone: 'Asia/Karachi',
      version: 1,
    },
  ],
  holidays: [
    // Named differently from its type on purpose, so the assertion below
    // proves the written type is rendered rather than matching the name.
    {
      _id: 'h1',
      date: '2026-03-23',
      name: 'Pakistan Day',
      type: 'PUBLIC',
      version: 1,
    },
  ],
  calendar: { _id: 'cal-1', name: 'Pakistan calendar', version: 1 },
  weeklyOffPattern: { _id: 'w1', daysOfWeek: [6, 0], version: 1 },
  policy: {
    _id: 'p1',
    leaveTypes: [{ name: 'Annual', annualEntitlement: 10 }],
    shortDayThresholdPercent: 89,
    leaveDeductionLadder: [
      { latenessFrom: 10, latenessTo: 40, deduction: 0.25 },
    ],
    ptoAwardLadder: [],
    ctoApplicationLadder: [],
    version: 1,
  },
  gaps: [
    {
      entity: 'General',
      field: 'midnightCrossingWindowHours',
      why: 'spec.md gives no value for this.',
    },
    { entity: 'General', field: 'managerId', why: 'This team has none.' },
  ],
  members: [{ _id: 'u1', fullName: 'Rosa Delgado', employeeCode: 'SUP-001' }],
};

const render17 = (overrides = {}) =>
  render(
    <TeamConfiguration
      configuration={{ ...configuration, ...overrides }}
      users={[{ _id: 'u1', fullName: 'Rosa Delgado' }]}
      canWrite
    />,
  );

describe('TeamConfiguration', () => {
  it('offers all six tabs', () => {
    render17();

    for (const label of [
      'Members',
      'Shifts',
      'Holiday calendar',
      'Leave policy',
      'Ladders',
      'Thresholds & windows',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('names every outstanding value rather than defaulting it', () => {
    // FR-3.13 and I-5: the gap is stated, and stays stated until it is set.
    render17();

    expect(screen.getByText(/midnightCrossingWindowHours/)).toBeInTheDocument();
    expect(screen.getByText(/managerId/)).toBeInTheDocument();
  });

  it('says the team is fully configured when nothing is outstanding', () => {
    render17({ gaps: [] });

    expect(screen.getByText(/fully configured/i)).toBeInTheDocument();
  });

  it('lists the members on the tab it opens on', () => {
    render17();
    expect(screen.getByText('Rosa Delgado')).toBeInTheDocument();
  });

  it('shows each shift with its own timezone', async () => {
    // FR-3.10: the timezone lives on the shift and nowhere else.
    render17();
    await userEvent.click(screen.getByRole('tab', { name: 'Shifts' }));

    expect(screen.getByText('Asia/Karachi')).toBeInTheDocument();
    expect(screen.getByText('Day 09:00 to 18:00')).toBeInTheDocument();
  });

  it('reads shift times off a 12-hour clock, not a 24-hour one', async () => {
    // Nobody in the office says "eighteen hundred". The stored value stays
    // `HH:mm` because that is what sorts and compares; only the reading here
    // changes.
    render17();
    await userEvent.click(screen.getByRole('tab', { name: 'Shifts' }));

    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    expect(screen.getByText('6:00 PM')).toBeInTheDocument();
  });

  it('shows a holiday with its written type, never colour alone', async () => {
    render17();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Holiday calendar' }),
    );

    expect(screen.getByText('2026-03-23')).toBeInTheDocument();
    expect(screen.getByText('Pakistan Day')).toBeInTheDocument();
    // FR-3.7: the type is spelled out, never left to a colour to convey.
    expect(screen.getByText('Public holiday')).toBeInTheDocument();
  });

  it('names the weekly off days in words rather than as numbers', async () => {
    // NFR-2: no unexplained abbreviation. "6, 0" means nothing to a reader.
    render17();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Holiday calendar' }),
    );

    expect(screen.getByText(/Saturday, Sunday/)).toBeInTheDocument();
  });

  it('offers no separate weekly off tab', () => {
    // The pattern belongs to the calendar now, and the calendar is shared, so
    // editing it from one team's screen would change other teams (`D-31`).
    render17();

    expect(
      screen.queryByRole('tab', { name: 'Weekly off' }),
    ).not.toBeInTheDocument();
  });

  it('names the assigned calendar and offers no control over it', async () => {
    render17();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Holiday calendar' }),
    );

    expect(
      screen.getByRole('link', { name: 'Pakistan calendar' }),
    ).toHaveAttribute('href', '/settings/holiday-calendars');
    expect(
      screen.queryByRole('button', { name: /new holiday/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save weekly off/i }),
    ).not.toBeInTheDocument();
  });

  it('points a team assigned to no calendar at S-26', async () => {
    render(
      <TeamConfiguration
        configuration={{
          ...configuration,
          calendar: null,
          holidays: [],
          weeklyOffPattern: null,
        }}
        users={[]}
        canWrite
      />,
    );
    await userEvent.click(
      screen.getByRole('tab', { name: 'Holiday calendar' }),
    );

    expect(
      screen.getByRole('link', { name: /holiday calendars/i }),
    ).toHaveAttribute('href', '/settings/holiday-calendars');
  });

  it('warns that saving a policy change triggers recalculation', async () => {
    // S-17's stated behaviour, and FR-6.12: existing overrides survive it.
    render17();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Thresholds & windows' }),
    );

    expect(screen.getByText(/recalculation/i)).toBeInTheDocument();
  });

  it('hides every write control from a viewer who cannot configure', () => {
    render(
      <TeamConfiguration
        configuration={configuration}
        users={[]}
        canWrite={false}
      />,
    );

    expect(screen.queryByRole('button', { name: /new shift/i })).toBeNull();
  });
});

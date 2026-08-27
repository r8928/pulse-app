import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOLIDAY_TYPE } from '../../constants/index.js';
import { HolidayCalendars } from '../HolidayCalendars.jsx';

/**
 * S-26. Asserts state, role and visibility — never a design token, which
 * belongs in `app/__tests__/theme.test.js`.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const calendar = (overrides = {}) => ({
  _id: 'cal-1',
  name: 'India',
  version: 1,
  teams: [],
  holidays: [],
  weeklyOffPattern: null,
  ...overrides,
});

const team = (overrides = {}) => ({
  _id: 'team-1',
  name: 'General',
  calendarId: null,
  calendarName: null,
  ...overrides,
});

describe('HolidayCalendars', () => {
  it('names each calendar and the teams it serves', () => {
    render(
      <HolidayCalendars
        calendars={[calendar({ teams: [{ _id: 'team-1', name: 'General' }] })]}
        teams={[team({ calendarId: 'cal-1', calendarName: 'India' })]}
        canWrite
      />,
    );

    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText(/1 team/)).toBeInTheDocument();
  });

  it('spells the non-working days out rather than showing numbers', () => {
    // NFR-2: "6, 0" tells a reader nothing.
    render(
      <HolidayCalendars
        calendars={[
          calendar({ weeklyOffPattern: { daysOfWeek: [0, 6], version: 1 } }),
        ]}
        teams={[]}
        canWrite
      />,
    );

    expect(screen.getByText(/Sunday and Saturday/)).toBeInTheDocument();
  });

  it('distinguishes a calendar that works every day from one never set', () => {
    // FR-3.8: an empty pattern is a real answer, not an unset one.
    const { rerender } = render(
      <HolidayCalendars
        calendars={[
          calendar({ weeklyOffPattern: { daysOfWeek: [], version: 1 } }),
        ]}
        teams={[]}
        canWrite
      />,
    );
    expect(screen.getByText(/works every day/)).toBeInTheDocument();

    rerender(<HolidayCalendars calendars={[calendar()]} teams={[]} canWrite />);
    expect(screen.getByText(/no weekly off set/)).toBeInTheDocument();
  });

  it('warns that a team on no calendar observes nothing', () => {
    // D-29: never defaulted, so the screen has to say the team is unconfigured
    // rather than letting it look like an ordinary Monday-to-Friday team.
    render(
      <HolidayCalendars calendars={[calendar()]} teams={[team()]} canWrite />,
    );

    const warning = screen
      .getAllByRole('alert')
      .find((each) => /observes\s+no calendar/.test(each.textContent));

    expect(warning).toBeDefined();
    expect(warning).toHaveTextContent(/General/);
  });

  it('offers no write control to a viewer without config.write', () => {
    render(
      <HolidayCalendars
        calendars={[calendar()]}
        teams={[team()]}
        canWrite={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /new calendar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove India/i }),
    ).not.toBeInTheDocument();
  });

  it('offers create, rename and remove to a writer', () => {
    render(<HolidayCalendars calendars={[calendar()]} teams={[]} canWrite />);

    expect(
      screen.getByRole('button', { name: /new calendar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /rename India/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove India/i }),
    ).toBeInTheDocument();
  });

  it('says every team is unconfigured when no calendar exists', () => {
    render(<HolidayCalendars calendars={[]} teams={[team()]} canWrite />);

    expect(screen.getByText(/No calendar exists yet/)).toBeInTheDocument();
  });

  it('counts the holidays on a calendar', () => {
    render(
      <HolidayCalendars
        calendars={[
          calendar({
            holidays: [
              {
                _id: 'h-1',
                date: '2026-08-14',
                name: 'Independence Day',
                type: HOLIDAY_TYPE.PUBLIC,
                version: 1,
              },
            ],
          }),
        ]}
        teams={[]}
        canWrite
      />,
    );

    expect(screen.getByText(/1 holiday/)).toBeInTheDocument();
  });
});

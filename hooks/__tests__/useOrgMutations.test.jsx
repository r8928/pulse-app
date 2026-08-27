import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLIDAY_TYPE } from '../../constants/index.js';
import { useOrgMutations } from '../useOrgMutations.js';

/**
 * The client half of the `S-26` contracts. `__tests__/api.holidayCalendars.test.js`
 * asserts the handlers fulfil them; this asserts the client sends what they
 * expect.
 *
 * A contract change is not done until both are updated in the same change.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lastCall = () => global.fetch.mock.calls.at(-1);

describe('useOrgMutations', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  it('posts a new calendar to the collection route', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(async () => {
      await result.current.createCalendar({ name: 'India' });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/holiday-calendars');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'India' });
  });

  it('patches a rename to the item route, carrying the version', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(async () => {
      await result.current.renameCalendar('cal-1', { name: 'US', version: 2 });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/holiday-calendars/cal-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'US', version: 2 });
  });

  it('posts a removal with its reason to the soft-delete route', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(async () => {
      await result.current.softDeleteCalendar('cal-1', {
        reason: 'Merged',
        version: 1,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/holiday-calendars/cal-1/soft-delete');
    expect(init.method).toBe('POST');
  });

  it('puts the team list to the calendar it belongs to', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(async () => {
      await result.current.setCalendarTeams('cal-1', {
        teamIds: ['team-1'],
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/holiday-calendars/cal-1/teams');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ teamIds: ['team-1'] });
  });

  it('puts the weekly off to the calendar, not the team', async () => {
    // P-32 moved with the pattern it edits: the first argument is a calendar
    // id now, and the team route is gone.
    const { result } = renderHook(() => useOrgMutations());
    await act(async () => {
      await result.current.setWeeklyOff('cal-1', {
        daysOfWeek: [0, 6],
        version: null,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/holiday-calendars/cal-1/weekly-off');
    expect(init.method).toBe('PUT');
  });

  it('posts a holiday naming its calendar', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(async () => {
      await result.current.createHoliday({
        calendarId: 'cal-1',
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/holidays');
    expect(JSON.parse(init.body).calendarId).toBe('cal-1');
  });
});

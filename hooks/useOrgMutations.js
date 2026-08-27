'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of S-16, S-17 and S-26 — M-6's whole surface, plus the
 * calendars M-7 hands it.
 *
 * One hook for all three because they share a single conflict surface: two
 * administrators editing the same team's configuration, or the same calendar,
 * is exactly the NFR-14 case, and P-47 has to look the same wherever it
 * happens.
 */
export function useOrgMutations() {
  const { post, patch, put, ...state } = useMutations();

  return {
    ...state,

    // P-28, P-29 · teams
    createTeam: (data) => post('/api/teams', data),
    updateTeam: (id, data) => patch(`/api/teams/${id}`, data),
    softDeleteTeam: (id, data) => post(`/api/teams/${id}/soft-delete`, data),

    // P-30 · shifts
    createShift: (data) => post('/api/shifts', data),
    updateShift: (id, data) => patch(`/api/shifts/${id}`, data),
    softDeleteShift: (id, data) => post(`/api/shifts/${id}/soft-delete`, data),

    // P-31 · the holidays on a calendar
    createHoliday: (data) => post('/api/holidays', data),
    updateHoliday: (id, data) => patch(`/api/holidays/${id}`, data),
    softDeleteHoliday: (id, data) =>
      post(`/api/holidays/${id}/soft-delete`, data),

    // S-26 · holiday calendars, shared across teams
    createCalendar: (data) => post('/api/holiday-calendars', data),
    renameCalendar: (id, data) => patch(`/api/holiday-calendars/${id}`, data),
    softDeleteCalendar: (id, data) =>
      post(`/api/holiday-calendars/${id}/soft-delete`, data),
    setCalendarTeams: (id, data) =>
      put(`/api/holiday-calendars/${id}/teams`, data),

    // P-32 · the weekly off pattern, now owned by the calendar rather than
    // the team. The name survives; its first argument changed meaning.
    setWeeklyOff: (calendarId, data) =>
      put(`/api/holiday-calendars/${calendarId}/weekly-off`, data),

    // P-33 to P-39 · everything in the FR-6.4 per-team list
    setPolicy: (teamId, data) => put(`/api/teams/${teamId}/policy`, data),
  };
}

'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of S-10 and S-12 — M-4's whole surface, plus the single-date
 * leave write D-16 brought forward from M-5.
 *
 * One hook for both screens because they share a conflict surface: two
 * administrators correcting the same day is exactly the NFR-14 case, and P-47
 * has to look the same wherever it happens.
 *
 * Every route below is asserted from the server side by the api.* contract
 * tests. A change to either half is not done until both are updated.
 */
export function useAttendanceMutations() {
  const { post, patch, del, ...state } = useMutations();

  return {
    ...state,

    // P-21, P-22 · punches. A wrong punch is EDITED, never cancelled by a
    // second one (FR-4.12).
    createPunch: (data) => post('/api/punches', data),
    updatePunch: (id, data) => patch(`/api/punches/${id}`, data),
    softDeletePunch: (id, data) => post(`/api/punches/${id}/soft-delete`, data),

    // P-23, P-24, P-25 · the day-level overrides. There is no separate
    // override record — the value sits on the day beside the engine's
    // (FR-6.11), which is why these address the date rather than an id.
    setDayOverride: (userId, date, data) =>
      patch(`/api/attendance/${userId}/${date}/override`, data),
    clearDayOverride: (userId, date, data) =>
      del(`/api/attendance/${userId}/${date}/override`, data),

    // P-26 · leave as an engine input, not an override (D-9, D-16).
    recordLeave: (data) => post('/api/leave-records', data),
    cancelLeave: (id, data) =>
      post(`/api/leave-records/${id}/soft-delete`, data),
  };
}

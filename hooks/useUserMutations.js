'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of the user lifecycle — the whole of M-3.
 *
 * The fetch, pending, error and 409-as-conflict machinery is shared with every
 * other mutation surface in `useMutations`, so P-47 behaves identically
 * wherever two administrators collide.
 *
 * Role, team and shift are separate operations from an ordinary edit, because
 * `FR-2.1` makes them separate decisions with different authority behind them:
 * `IT` creates and edits a user, but changing their role or their team belongs
 * to `OFFICE_ADMIN`.
 */
export function useUserMutations() {
  const { post, patch, ...state } = useMutations();

  return {
    ...state,

    // P-08, P-09
    createUser: (data) => post('/api/users', data),
    updateUser: (id, data) => patch(`/api/users/${id}`, data),

    // P-15, P-16
    softDeleteUser: (id, data) => post(`/api/users/${id}/soft-delete`, data),
    restoreUser: (id, data) => post(`/api/users/${id}/restore`, data),

    // P-10, P-11, P-12
    changeRole: (id, data) => post(`/api/users/${id}/role`, data),
    moveTeam: (id, data) => post(`/api/users/${id}/team`, data),
    assignShift: (id, data) => post(`/api/users/${id}/shift`, data),

    // P-13, P-14 — the two independent booleans of FR-2.5
    setFlag: (id, data) => post(`/api/users/${id}/flag`, data),

    // P-17, P-18
    createTenure: (userId, data) => post(`/api/users/${userId}/tenures`, data),
    updateTenure: (id, data) => patch(`/api/tenures/${id}`, data),
    softDeleteTenure: (id, data) =>
      post(`/api/tenures/${id}/soft-delete`, data),
  };
}

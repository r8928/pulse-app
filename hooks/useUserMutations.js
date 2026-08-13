'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of the user lifecycle.
 *
 * The fetch, pending, error and 409-as-conflict machinery is shared with every
 * other mutation surface in `useMutations`, so P-47 behaves identically
 * wherever two administrators collide.
 */
export function useUserMutations() {
  const { post, ...state } = useMutations();

  return {
    ...state,
    createUser: (data) => post('/api/users', data),
    softDeleteUser: (id, data) => post(`/api/users/${id}/soft-delete`, data),
    restoreUser: (id, data) => post(`/api/users/${id}/restore`, data),
  };
}

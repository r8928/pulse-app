'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of S-18 and S-19.
 *
 * One hook for both screens because they share a single mutation contract and
 * a single conflict surface; splitting it would duplicate the 409 handling for
 * no gain.
 */
export function useConfigMutations() {
  const { post, patch, ...state } = useMutations();

  return {
    ...state,

    // P-40 · employment types
    createEmploymentType: (data) => post('/api/employment-types', data),
    renameEmploymentType: (id, data) =>
      patch(`/api/employment-types/${id}`, data),
    softDeleteEmploymentType: (id, data) =>
      post(`/api/employment-types/${id}/soft-delete`, data),

    // P-41 · authorised Workspace domains
    addDomain: (data) => post('/api/authorised-domains', data),
    removeDomain: (id, data) =>
      post(`/api/authorised-domains/${id}/soft-delete`, data),

    // P-42 · one cell of the access control matrix
    setGrant: (data) => patch('/api/permission-grants', data),
  };
}

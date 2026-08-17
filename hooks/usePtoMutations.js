'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of S-15 — P-01 to P-04 and P-27, PTO and CTO alike.
 *
 * One hook for both halves because they share a screen and a conflict
 * surface: two administrators deciding the same candidate is exactly the
 * NFR-14 case P-47 exists for.
 *
 * Every route below is asserted from the server side by
 * `__tests__/api.pto.test.js` and `api.cto.test.js`. A change to either half
 * is not done until both are updated.
 */
export function usePtoMutations() {
  const { post, ...state } = useMutations();

  return {
    ...state,

    // P-01, P-03 · nothing posts to the ledger until approve returns (FR-7.1).
    approvePto: (id, data) => post(`/api/pto/${id}/approve`, data),
    declinePto: (id, data) => post(`/api/pto/${id}/decline`, data),

    // P-04 · a day the engine raised no suggestion for (FR-7.7).
    originatePto: (data) => post('/api/pto/originate', data),

    // P-27 · reverses any posted PTO_EXPIRY before the new date takes over.
    overrideExpiry: (id, data) => post(`/api/pto/${id}/expiry`, data),

    // P-02 · `override` carries BR-26's block past an insufficient balance,
    // and is only ever sent when an approver explicitly asked for it.
    approveCto: (id, data) => post(`/api/cto/${id}/approve`, data),
    declineCto: (id, data) => post(`/api/cto/${id}/decline`, data),
    originateCto: (data) => post('/api/cto/originate', data),
  };
}

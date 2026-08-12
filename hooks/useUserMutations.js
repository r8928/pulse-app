'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The write side of the user lifecycle.
 *
 * Components stay pure — data in via props, actions out via callbacks — so
 * fetching, pending state and error handling live here rather than in the
 * roster or the detail screen.
 *
 * A 409 carries the current server state. It is surfaced as `conflict` rather
 * than a plain error so the caller can show P-47, which has to display what
 * the record looks like now for the two administrators to reconcile (NFR-14).
 */
async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error ?? 'The request failed.');
    error.status = response.status;
    error.current = payload.current ?? null;
    throw error;
  }

  return payload;
}

export function useUserMutations() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  const run = async (action) => {
    setPending(true);
    setError(null);
    setConflict(null);

    try {
      await action();
      // The screens are server-rendered, so the refreshed data comes from the
      // server rather than from optimistic local state that could drift.
      router.refresh();
      return true;
    } catch (caught) {
      if (caught.status === 409) {
        setConflict(caught.current);
      } else {
        setError(caught.message);
      }
      return false;
    } finally {
      setPending(false);
    }
  };

  return {
    pending,
    error,
    conflict,
    dismissConflict: () => setConflict(null),
    createUser: (data) => run(() => post('/api/users', data)),
    softDeleteUser: (id, data) =>
      run(() => post(`/api/users/${id}/soft-delete`, data)),
    restoreUser: (id, data) =>
      run(() => post(`/api/users/${id}/restore`, data)),
  };
}

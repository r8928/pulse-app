'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The client half of every mutation contract.
 *
 * Components stay pure — data in via props, actions out via callbacks — so
 * fetching, pending state and error handling live here rather than in a
 * screen.
 *
 * A 409 carries the current server state. It is surfaced as `conflict` rather
 * than a plain error because P-47 has to display what the record looks like
 * now for two administrators to reconcile (NFR-14).
 */
async function send(method, url, body) {
  const response = await fetch(url, {
    method,
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

export function useMutations() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  /**
   * Resolves true on success and false on failure rather than throwing. Every
   * dialog in the application decides whether to close on that boolean, so a
   * rejected write leaves the form open with the reason still typed in it.
   */
  const run = async (action) => {
    setPending(true);
    setError(null);
    setConflict(null);

    try {
      await action();
      // The screens are server-rendered, so refreshed data comes from the
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
    post: (url, body) => run(() => send('POST', url, body)),
    patch: (url, body) => run(() => send('PATCH', url, body)),
    // PUT is for the two records that are replaced whole rather than patched:
    // a team's weekly off pattern and its policy document.
    put: (url, body) => run(() => send('PUT', url, body)),
    /**
     * DELETE removes a sub-resource, never a record. The only one is a day
     * record's override (P-23 to P-25 undone) — the day itself survives, and
     * nothing in Pulse is ever hard deleted (FR-2.2, I-1).
     */
    del: (url, body) => run(() => send('DELETE', url, body)),
  };
}

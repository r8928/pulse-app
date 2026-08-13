import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutations } from '../useMutations.js';

/**
 * The client half of every mutation contract: what it sends, and what it does
 * with each documented status code (ARCHITECTURE 9.1).
 *
 * The 409 case is the one that matters most — NFR-14 makes two administrators
 * on the same period the normal case, and P-47 has to show what the other one
 * did rather than a bare error.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const respond = (status, body) =>
  vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  });

describe('useMutations', () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it('sends a JSON body and refreshes the server-rendered screen on success', async () => {
    global.fetch = respond(200, { _id: '1' });
    const { result } = renderHook(() => useMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.post('/api/things', { name: 'Annual' });
    });

    expect(outcome).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/things', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Annual' }),
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('surfaces a 400 as a readable error and does not refresh', async () => {
    global.fetch = respond(400, { error: 'Full name is required' });
    const { result } = renderHook(() => useMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.patch('/api/things/1', { version: 1 });
    });

    expect(outcome).toBe(false);
    await waitFor(() =>
      expect(result.current.error).toBe('Full name is required'),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces a 409 as a conflict carrying the current state, not as an error', async () => {
    global.fetch = respond(409, {
      error: 'This record changed since you loaded it.',
      current: { _id: '1', version: 4 },
    });
    const { result } = renderHook(() => useMutations());

    await act(async () => {
      await result.current.patch('/api/things/1', { version: 1 });
    });

    await waitFor(() =>
      expect(result.current.conflict).toEqual({ _id: '1', version: 4 }),
    );
    expect(result.current.error).toBeNull();

    act(() => result.current.dismissConflict());
    expect(result.current.conflict).toBeNull();
  });

  it('sends PATCH when asked to patch', async () => {
    global.fetch = respond(200, {});
    const { result } = renderHook(() => useMutations());

    await act(async () => {
      await result.current.patch('/api/things/1', { version: 1 });
    });

    expect(global.fetch.mock.calls[0][1].method).toBe('PATCH');
  });

  it('reports a readable message when the body is not JSON at all', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Unexpected token');
      },
    });
    const { result } = renderHook(() => useMutations());

    await act(async () => {
      await result.current.post('/api/things', {});
    });

    await waitFor(() =>
      expect(result.current.error).toBe('The request failed.'),
    );
  });
});

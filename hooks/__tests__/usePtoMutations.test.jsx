import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePtoMutations } from '../usePtoMutations.js';

/**
 * The client half of the §26.2 PTO/CTO contracts.
 * `__tests__/api.pto.test.js` and `api.cto.test.js` assert the handlers
 * fulfil them; this asserts the client sends what they expect.
 *
 * A contract change is not done until both are updated in the same change.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lastCall = () => global.fetch.mock.calls.at(-1);

describe('usePtoMutations', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  it('posts a PTO approval to the award, carrying amount, reason and version', async () => {
    const { result } = renderHook(() => usePtoMutations());
    await act(async () => {
      await result.current.approvePto('a1', {
        amount: 1,
        reason: 'Confirmed with the team lead',
        version: 1,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/pto/a1/approve');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ amount: 1, version: 1 });
  });

  it('posts a PTO decline to its own route', async () => {
    const { result } = renderHook(() => usePtoMutations());
    await act(async () => {
      await result.current.declinePto('a1', { reason: 'Not owed', version: 1 });
    });

    expect(lastCall()[0]).toBe('/api/pto/a1/decline');
  });

  it('posts a manual PTO grant to the collection originate route (FR-7.7)', async () => {
    const { result } = renderHook(() => usePtoMutations());
    await act(async () => {
      await result.current.originatePto({
        userId: 'u1',
        date: '2026-08-15',
        amount: 1,
        reason: 'Worked the site outage with no punch record',
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/pto/originate');
    expect(JSON.parse(init.body).userId).toBe('u1');
  });

  it('posts an expiry override to the award (P-27)', async () => {
    const { result } = renderHook(() => usePtoMutations());
    await act(async () => {
      await result.current.overrideExpiry('a1', {
        expiresAt: '2027-06-01',
        reason: 'Extended by agreement',
        version: 2,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/pto/a1/expiry');
    expect(JSON.parse(init.body).expiresAt).toBe('2027-06-01');
  });

  it('posts a CTO approval, carrying the BR-26 override when one was given', async () => {
    const { result } = renderHook(() => usePtoMutations());
    await act(async () => {
      await result.current.approveCto('c1', {
        amount: 0.5,
        reason: 'Approved anyway',
        override: true,
        version: 1,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/cto/c1/approve');
    expect(JSON.parse(init.body).override).toBe(true);
  });

  it('posts a CTO decline and a manual CTO application to their own routes', async () => {
    const { result } = renderHook(() => usePtoMutations());

    await act(async () => {
      await result.current.declineCto('c1', { reason: 'x', version: 1 });
    });
    expect(lastCall()[0]).toBe('/api/cto/c1/decline');

    await act(async () => {
      await result.current.originateCto({
        userId: 'u1',
        date: '2026-08-15',
        amount: 0.5,
        reason: 'Applied by agreement',
      });
    });
    expect(lastCall()[0]).toBe('/api/cto/originate');
  });

  it("reports BR-26's refusal without throwing, so the dialog stays open with the reason typed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error:
          'Insufficient PTO balance to apply CTO: 0 available, 0.5 requested.',
      }),
    });
    const { result } = renderHook(() => usePtoMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.approveCto('c1', {
        amount: 0.5,
        reason: 'x',
        version: 1,
      });
    });

    expect(outcome).toBe(false);
    await waitFor(() => expect(result.current.error).toContain('Insufficient'));
  });

  it('surfaces a 409 as a conflict rather than an error, so P-47 can show it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Stale', current: { version: 4 } }),
    });
    const { result } = renderHook(() => usePtoMutations());

    await act(async () => {
      await result.current.approvePto('a1', {
        amount: 1,
        reason: 'x',
        version: 1,
      });
    });

    await waitFor(() =>
      expect(result.current.conflict).toMatchObject({ version: 4 }),
    );
    expect(result.current.error).toBeNull();
  });
});

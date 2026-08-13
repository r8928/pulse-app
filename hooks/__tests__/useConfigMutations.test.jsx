import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../../constants/index.js';
import { useConfigMutations } from '../useConfigMutations.js';

/**
 * The client half of the M-7 contracts. `__tests__/api.*.test.js` asserts the
 * handlers fulfil them; this asserts the client sends what they expect.
 *
 * A contract change is not done until both are updated in the same change.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lastCall = () => global.fetch.mock.calls.at(-1);

describe('useConfigMutations', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  it('posts a new employment type to the collection route', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.createEmploymentType({ name: 'CONTRACT' });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/employment-types');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'CONTRACT' });
  });

  it('patches a rename to the item route, carrying the version', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.renameEmploymentType('abc', {
        name: 'FIXED_TERM',
        version: 3,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/employment-types/abc');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'FIXED_TERM', version: 3 });
  });

  it('posts a soft delete with its reason and version', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.softDeleteEmploymentType('abc', {
        reason: 'Unused',
        version: 1,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/employment-types/abc/soft-delete');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Unused', version: 1 });
  });

  it('posts and removes a domain on the domain routes', async () => {
    const { result } = renderHook(() => useConfigMutations());

    await act(async () => {
      await result.current.addDomain({ domain: 'example.com' });
    });
    expect(lastCall()[0]).toBe('/api/authorised-domains');

    await act(async () => {
      await result.current.removeDomain('xyz', {
        reason: 'Changed',
        version: 1,
      });
    });
    expect(lastCall()[0]).toBe('/api/authorised-domains/xyz/soft-delete');
  });

  it('patches one matrix cell, sending scope, reason and version', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.setGrant({
        role: ROLES.IT,
        permission: PERMISSIONS.AUDIT_READ,
        scope: SCOPES.ALL,
        reason: 'IT triages sign-in failures',
        version: null,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/permission-grants');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toMatchObject({
      role: ROLES.IT,
      scope: SCOPES.ALL,
      version: null,
    });
  });

  it('reports failure without throwing, so a dialog can stay open', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'A name is required' }),
    });
    const { result } = renderHook(() => useConfigMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.createEmploymentType({ name: '' });
    });

    expect(outcome).toBe(false);
    await waitFor(() =>
      expect(result.current.error).toBe('A name is required'),
    );
  });
});

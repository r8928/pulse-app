import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUNCH_SOURCE, PUNCH_TYPE } from '../../constants/index.js';
import { useAttendanceMutations } from '../useAttendanceMutations.js';

/**
 * The client half of the M-4 contracts. `__tests__/api.punches.test.js`,
 * `api.attendance.test.js` and `api.leaveRecords.test.js` assert the handlers
 * fulfil them; this asserts the client sends what they expect.
 *
 * A contract change is not done until both are updated in the same change.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lastCall = () => global.fetch.mock.calls.at(-1);

describe('useAttendanceMutations', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  it('posts a new punch to the collection route', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.createPunch({
        userId: 'u1',
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/punches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).type).toBe(PUNCH_TYPE.CHECK_IN);
  });

  it('patches a correction to the item route, carrying reason and version', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.updatePunch('p1', {
        at: '2026-08-12T06:00:00.000Z',
        reason: 'Imported an hour out',
        version: 2,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/punches/p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toMatchObject({
      reason: 'Imported an hour out',
      version: 2,
    });
  });

  it('posts a punch soft delete with its reason', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.softDeletePunch('p1', {
        reason: 'Wrong person',
        version: 1,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/punches/p1/soft-delete');
    expect(init.method).toBe('POST');
  });

  it('patches a day override onto that user and date', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.setDayOverride('u1', '2026-08-12', {
        dayStatus: 'WFH',
        reason: 'Outage',
        version: 1,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/attendance/u1/2026-08-12/override');
    expect(init.method).toBe('PATCH');
  });

  it('deletes a day override on the same path', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.clearDayOverride('u1', '2026-08-12', {
        reason: 'Raised in error',
        version: 2,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/attendance/u1/2026-08-12/override');
    expect(init.method).toBe('DELETE');
  });

  it('posts a day of leave to the leave record route', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.recordLeave({
        userId: 'u1',
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Family matter',
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/leave-records');
    expect(init.method).toBe('POST');
  });

  it('posts a leave cancellation to its soft-delete route', async () => {
    const { result } = renderHook(() => useAttendanceMutations());
    await act(async () => {
      await result.current.cancelLeave('l1', {
        reason: 'Came in after all',
        version: 1,
      });
    });

    expect(lastCall()[0]).toBe('/api/leave-records/l1/soft-delete');
  });

  it('reports failure without throwing, so a dialog can stay open', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'A reason is required' }),
    });
    const { result } = renderHook(() => useAttendanceMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.softDeletePunch('p1', { version: 1 });
    });

    expect(outcome).toBe(false);
    await waitFor(() =>
      expect(result.current.error).toBe('A reason is required'),
    );
  });

  it('surfaces a 409 as a conflict rather than an error, so P-47 can show it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Stale',
        current: { version: 4, computed: { deduction: 0.5 } },
      }),
    });
    const { result } = renderHook(() => useAttendanceMutations());

    await act(async () => {
      await result.current.setDayOverride('u1', '2026-08-12', {
        deduction: 0,
        reason: 'Waived',
        version: 1,
      });
    });

    await waitFor(() =>
      expect(result.current.conflict).toMatchObject({ version: 4 }),
    );
    expect(result.current.error).toBeNull();
  });
});

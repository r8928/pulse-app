import { describe, expect, it } from 'vitest';
import { recalculateDays } from '../recalculate.js';

/**
 * Design record D-4. The seam exists from Phase 4 so its callers are written,
 * audited and reviewed once — Phase 5 fills the body and reopens no route.
 *
 * These tests pin the contract, not the behaviour. When Phase 5 implements it,
 * the count assertion changes and everything else here should still hold.
 */

describe('recalculateDays', () => {
  it('reports nothing recalculated, because no day record exists yet', async () => {
    expect(
      await recalculateDays('user-1', { from: '2026-01-01', to: '2026-01-31' }),
    ).toEqual({ recalculated: 0 });
  });

  it('accepts an open-ended range, which a team move produces', async () => {
    // FR-3.14: a move triggers recalculation from its effective date forward
    // only, and never rewrites history.
    expect(
      await recalculateDays('user-1', { from: '2026-06-01', to: null }),
    ).toEqual({ recalculated: 0 });
  });

  it('accepts a null user, which a team-wide policy change produces', async () => {
    expect(
      await recalculateDays(null, { from: '2026-01-01', to: null }),
    ).toEqual({ recalculated: 0 });
  });

  it('is idempotent, which invariant I-9 requires of it permanently', async () => {
    const range = { from: '2026-01-01', to: '2026-01-31' };

    const first = await recalculateDays('user-1', range);
    const second = await recalculateDays('user-1', range);

    expect(second).toEqual(first);
  });
});

import { describe, expect, it } from 'vitest';
import { effective, hasOverride } from '../dayRecord.js';

const record = {
  computed: { dayStatus: 'WFO', workedMinutes: 402, deduction: 0.25 },
  override: { dayStatus: 'WFH', actorId: 'a1', reason: 'Outage' },
};

describe('effective', () => {
  it('prefers the override where one is set', () => {
    expect(effective(record, 'dayStatus')).toBe('WFH');
  });

  it('falls back to the computed value for a field the override does not mention', () => {
    expect(effective(record, 'workedMinutes')).toBe(402);
  });

  it('reads computed when there is no override at all', () => {
    expect(
      effective({ computed: { deduction: 0.5 }, override: null }, 'deduction'),
    ).toBe(0.5);
  });

  it('treats an override of 0 as a real value, not as absent', () => {
    const waived = {
      computed: { deduction: 0.25 },
      override: { deduction: 0 },
    };
    expect(effective(waived, 'deduction')).toBe(0);
  });

  it('reports which fields carry an override', () => {
    expect(hasOverride(record, 'dayStatus')).toBe(true);
    expect(hasOverride(record, 'workedMinutes')).toBe(false);
    expect(hasOverride({ computed: {}, override: null }, 'dayStatus')).toBe(
      false,
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  clearDayOverride,
  listDayRecords,
  setDayOverride,
  upsertDayRecord,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * ARCHITECTURE §12.1 and §19.3. Engine values and human values sit side by
 * side and never overwrite one another, and a recalculation that concludes
 * nothing new writes nothing at all — a spurious version bump would mint a
 * fresh effect key and let a re-run post the same movement twice.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const computed = {
  dayStatus: 'WFO',
  workedMinutes: 402,
  lateMinutes: 120,
  earlyMinutes: 0,
  deduction: 0.25,
  deductionRule: 'BR-9:profileB:band1',
  isShortDay: true,
};

const aDay = (overrides = {}) => ({
  userId: 'user-1',
  date: '2026-08-12',
  teamId: 'team-1',
  shiftId: 'shift-1',
  dayType: 'WORKING',
  computed,
  exceptions: [],
  ...overrides,
});

describe('day records', () => {
  useTestDatabase();

  describe('upsertDayRecord', () => {
    it('creates the record on first write and reports it changed', async () => {
      const { record, changed } = await upsertDayRecord(aDay());

      expect(changed).toBe(true);
      expect(record.version).toBe(1);
      expect(record.computed.deduction).toBe(0.25);
      expect(record.override).toBeNull();
    });

    it('writes NOTHING and bumps no version when nothing changed (§19.3)', async () => {
      const first = await upsertDayRecord(aDay());
      const second = await upsertDayRecord(aDay());

      expect(second.changed).toBe(false);
      expect(second.record.version).toBe(first.record.version);
      expect(second.record.updatedAt).toEqual(first.record.updatedAt);
    });

    it('bumps the version when a computed value genuinely changed', async () => {
      const first = await upsertDayRecord(aDay());
      const second = await upsertDayRecord(
        aDay({ computed: { ...computed, deduction: 0.5 } }),
      );

      expect(second.changed).toBe(true);
      expect(second.record.version).toBe(first.record.version + 1);
    });

    it('notices a change to the exceptions list alone', async () => {
      await upsertDayRecord(aDay());
      const second = await upsertDayRecord(
        aDay({ exceptions: ['MISSING_CHECK_OUT'] }),
      );

      expect(second.changed).toBe(true);
    });

    it('treats a reordered exceptions list as unchanged, not as a new conclusion', async () => {
      await upsertDayRecord(
        aDay({ exceptions: ['MISSING_CHECK_OUT', 'IMPOSSIBLE_DURATION'] }),
      );
      const second = await upsertDayRecord(
        aDay({ exceptions: ['IMPOSSIBLE_DURATION', 'MISSING_CHECK_OUT'] }),
      );

      expect(second.changed).toBe(false);
    });

    it('notices a change of team, which a mid-year move produces', async () => {
      await upsertDayRecord(aDay());
      const second = await upsertDayRecord(aDay({ teamId: 'team-2' }));

      expect(second.changed).toBe(true);
    });

    it('leaves an override standing while it refreshes the computed value (I-6, FR-6.12)', async () => {
      const created = await upsertDayRecord(aDay());
      await setDayOverride(
        'user-1',
        '2026-08-12',
        { dayStatus: 'WFH', reason: 'Home internet outage' },
        created.record.version,
        actor,
      );

      const after = await upsertDayRecord(
        aDay({ computed: { ...computed, workedMinutes: 500 } }),
      );

      expect(after.record.override.dayStatus).toBe('WFH');
      expect(after.record.override.reason).toBe('Home internet outage');
      expect(after.record.computed.workedMinutes).toBe(500);
    });
  });

  describe('setDayOverride', () => {
    it('records who, why and when beside the engine value (FR-6.11)', async () => {
      const created = await upsertDayRecord(aDay());
      const after = await setDayOverride(
        'user-1',
        '2026-08-12',
        { deduction: 0, reason: 'Late arrival waived under BR-8' },
        created.record.version,
        actor,
      );

      expect(after.override.deduction).toBe(0);
      expect(after.override.actorId).toBe('actor-1');
      expect(after.override.actorName).toBe('Office Administrator');
      expect(after.override.at).toBeInstanceOf(Date);
      expect(after.computed.deduction).toBe(0.25);
    });

    it('requires a reason', async () => {
      const created = await upsertDayRecord(aDay());

      await expect(
        setDayOverride(
          'user-1',
          '2026-08-12',
          { deduction: 0 },
          created.record.version,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('rejects an override that changes nothing', async () => {
      const created = await upsertDayRecord(aDay());

      await expect(
        setDayOverride(
          'user-1',
          '2026-08-12',
          { reason: 'No values given' },
          created.record.version,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('refuses a stale write', async () => {
      await upsertDayRecord(aDay());

      await expect(
        setDayOverride(
          'user-1',
          '2026-08-12',
          { deduction: 0, reason: 'Waived' },
          99,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'StaleWriteError' });
    });

    it('returns null for a day record that does not exist', async () => {
      expect(
        await setDayOverride(
          'nobody',
          '2026-08-12',
          { deduction: 0, reason: 'Waived' },
          1,
          actor,
        ),
      ).toBeNull();
    });
  });

  describe('clearDayOverride', () => {
    it('removes the human decision and leaves the engine value in charge', async () => {
      const created = await upsertDayRecord(aDay());
      const overridden = await setDayOverride(
        'user-1',
        '2026-08-12',
        { dayStatus: 'WFH', reason: 'Outage' },
        created.record.version,
        actor,
      );

      const cleared = await clearDayOverride(
        'user-1',
        '2026-08-12',
        'Raised in error',
        overridden.version,
        actor,
      );

      expect(cleared.override).toBeNull();
      expect(cleared.computed.dayStatus).toBe('WFO');
    });

    it('requires a reason of its own', async () => {
      const created = await upsertDayRecord(aDay());

      await expect(
        clearDayOverride(
          'user-1',
          '2026-08-12',
          '   ',
          created.record.version,
          actor,
        ),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });
  });

  describe('listDayRecords', () => {
    it('returns the records in a range for the users asked about', async () => {
      await upsertDayRecord(aDay({ date: '2026-08-12' }));
      await upsertDayRecord(aDay({ date: '2026-08-13' }));
      await upsertDayRecord(aDay({ userId: 'user-2', date: '2026-08-12' }));

      const mine = await listDayRecords({
        userIds: ['user-1'],
        from: '2026-08-12',
        to: '2026-08-12',
      });
      expect(mine).toHaveLength(1);

      const both = await listDayRecords({
        from: '2026-08-12',
        to: '2026-08-13',
      });
      expect(both).toHaveLength(3);
    });
  });
});

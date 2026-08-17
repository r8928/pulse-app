import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  getPtoAwardForDate,
  listPtoAwards,
  upsertPtoCandidate,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * D-21 (design record). PTO candidates are genuine records with status,
 * because a human decision has to survive a recalculation that doesn't
 * change the day (FR-7.8).
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('ptoAwards', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `PT-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
      },
      actor,
    );
  };

  describe('upsertPtoCandidate', () => {
    it('creates a PENDING candidate with no approved amount yet', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );

      const stored = await getPtoAwardForDate(userId, '2026-08-12');
      expect(stored.status).toBe('PENDING');
      expect(stored.rule).toBe('BR-19');
      expect(stored.proposedAmount).toBe(1);
      expect(stored.approvedAmount).toBeNull();
      expect(stored.version).toBe(1);
    });

    it('updates the stored rule and amount, bumping the version', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-18', amount: 0.5 },
        },
        actor,
      );
      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'UPDATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );

      const stored = await getPtoAwardForDate(userId, '2026-08-12');
      expect(stored.rule).toBe('BR-19');
      expect(stored.proposedAmount).toBe(1);
      expect(stored.version).toBe(2);
    });

    it('does nothing for a NONE action', async () => {
      const user = await aUser();
      const userId = String(user._id);

      const result = await upsertPtoCandidate(
        userId,
        '2026-08-12',
        { action: 'NONE' },
        actor,
      );

      expect(result).toBeNull();
      expect(await getPtoAwardForDate(userId, '2026-08-12')).toBeNull();
    });

    it('marks a withdrawn candidate rather than deleting it', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-18', amount: 0.5 },
        },
        actor,
      );
      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        { action: 'UPDATE', patch: { withdrawn: true } },
        actor,
      );

      const stored = await getPtoAwardForDate(userId, '2026-08-12');
      expect(stored.withdrawn).toBe(true);
      expect(stored.rule).toBe('BR-18'); // history intact
    });
  });

  describe('listPtoAwards', () => {
    it('leaves a withdrawn candidate out, because it is no longer a proposal', async () => {
      // D-22 keeps a withdrawn candidate rather than deleting it, but the day
      // stopped qualifying — listing it as PENDING would put a suggestion the
      // engine has retracted back into S-15's approval queue.
      const user = await aUser();
      const userId = String(user._id);

      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-18', amount: 0.5 },
        },
        actor,
      );
      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        { action: 'UPDATE', patch: { withdrawn: true } },
        actor,
      );

      expect(await listPtoAwards({ userIds: [userId] })).toEqual([]);
      expect(
        await listPtoAwards({ userIds: [userId], includeWithdrawn: true }),
      ).toHaveLength(1);
    });

    it('narrows by status, by user and by range', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertPtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-18', amount: 0.5 },
        },
        actor,
      );
      await upsertPtoCandidate(
        userId,
        '2026-09-01',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );

      expect(
        (await listPtoAwards({ userIds: [userId], status: 'PENDING' })).length,
      ).toBe(2);
      expect(
        (
          await listPtoAwards({
            userIds: [userId],
            from: '2026-08-01',
            to: '2026-08-31',
          })
        ).length,
      ).toBe(1);
      expect((await listPtoAwards({ userIds: ['nobody'] })).length).toBe(0);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  getCtoApplicationForDate,
  listCtoApplications,
  upsertCtoCandidate,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * D-21 (design record). The same lifecycle as ptoAwards, substituting
 * appliedAmount for approvedAmount and adding blockOverridden (BR-26).
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('ctoApplications', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `CT-${String(codes++).padStart(3, '0')}`,
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

  describe('upsertCtoCandidate', () => {
    it('creates a PENDING candidate with no applied amount yet', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertCtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-22', amount: 0.25 },
        },
        actor,
      );

      const stored = await getCtoApplicationForDate(userId, '2026-08-12');
      expect(stored.status).toBe('PENDING');
      expect(stored.rule).toBe('BR-22');
      expect(stored.proposedAmount).toBe(0.25);
      expect(stored.appliedAmount).toBeNull();
      expect(stored.blockOverridden).toBe(false);
    });

    it('updates the stored rule and amount, bumping the version', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertCtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-22', amount: 0.25 },
        },
        actor,
      );
      await upsertCtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'UPDATE',
          patch: { status: 'PENDING', rule: 'BR-24', amount: 0.75 },
        },
        actor,
      );

      const stored = await getCtoApplicationForDate(userId, '2026-08-12');
      expect(stored.rule).toBe('BR-24');
      expect(stored.version).toBe(2);
    });

    it('does nothing for a NONE action', async () => {
      const user = await aUser();
      const userId = String(user._id);

      expect(
        await upsertCtoCandidate(
          userId,
          '2026-08-12',
          { action: 'NONE' },
          actor,
        ),
      ).toBeNull();
    });

    it('marks a withdrawn candidate rather than deleting it', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertCtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-22', amount: 0.25 },
        },
        actor,
      );
      await upsertCtoCandidate(
        userId,
        '2026-08-12',
        { action: 'UPDATE', patch: { withdrawn: true } },
        actor,
      );

      expect(
        (await getCtoApplicationForDate(userId, '2026-08-12')).withdrawn,
      ).toBe(true);
    });
  });

  describe('listCtoApplications', () => {
    it('narrows by status, by user and by range', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await upsertCtoCandidate(
        userId,
        '2026-08-12',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-22', amount: 0.25 },
        },
        actor,
      );
      await upsertCtoCandidate(
        userId,
        '2026-09-01',
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-24', amount: 0.75 },
        },
        actor,
      );

      expect(
        (await listCtoApplications({ userIds: [userId], status: 'PENDING' }))
          .length,
      ).toBe(2);
      expect(
        (
          await listCtoApplications({
            userIds: [userId],
            from: '2026-08-01',
            to: '2026-08-31',
          })
        ).length,
      ).toBe(1);
    });
  });
});

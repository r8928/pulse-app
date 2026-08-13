import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  assignUserShift,
  changeUserRole,
  createTeam,
  createTenure,
  createUser,
  getTeamById,
  getUserById,
  listShiftAssignments,
  listTeamAssignments,
  moveUserTeam,
  StaleWriteError,
  setUserFlag,
  softDeleteTenure,
  updateTenure,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * M-3's remainder: FR-1.7, FR-2.12, FR-3.6 and FR-3.14.
 *
 * The rule underneath all of it is that history is never rewritten — an
 * assignment carries an effective date range, so the team or shift a user held
 * on a past date is still the one the engine will resolve for that date.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const user = (overrides = {}) =>
  createUser(
    {
      fullName: 'Alice Adeyemi',
      employeeCode: 'EMP-001',
      employmentType: 'PERMANENT',
      tracked: true,
      loginEnabled: true,
      role: ROLES.EMPLOYEE,
      dateOfJoining: '2026-01-05',
      ...overrides,
    },
    actor,
  );

describe('changeUserRole', () => {
  useTestDatabase();

  it('changes the role and audits it', async () => {
    const alice = await user();
    const changed = await changeUserRole(
      String(alice._id),
      { role: ROLES.IT, reason: 'Joined the IT team' },
      alice.version,
      actor,
    );

    expect(changed.role).toBe(ROLES.IT);
    expect(changed.version).toBe(2);
  });

  it('requires a team when the new role is MANAGER', async () => {
    // FR-1.7: the actor names the team, so "exactly one manager" is decidable.
    const alice = await user();

    await expect(
      changeUserRole(
        String(alice._id),
        { role: ROLES.MANAGER, reason: 'Promoted' },
        alice.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('replaces that team’s previous manager in the same action', async () => {
    const team = await createTeam({ name: 'GC' }, actor);
    const first = await user({ fullName: 'First', employeeCode: 'A-1' });
    const second = await user({ fullName: 'Second', employeeCode: 'A-2' });

    await changeUserRole(
      String(first._id),
      {
        role: ROLES.MANAGER,
        teamId: String(team._id),
        reason: 'Promoted',
      },
      first.version,
      actor,
    );

    await changeUserRole(
      String(second._id),
      {
        role: ROLES.MANAGER,
        teamId: String(team._id),
        reason: 'Took over',
      },
      second.version,
      actor,
    );

    expect((await getTeamById(String(team._id))).managerId).toBe(
      String(second._id),
    );
  });

  it('requires a reason', async () => {
    const alice = await user();

    await expect(
      changeUserRole(
        String(alice._id),
        { role: ROLES.IT, reason: '' },
        alice.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe('moveUserTeam', () => {
  useTestDatabase();

  it('records the move with an effective date rather than rewriting history', async () => {
    // FR-3.14: the team a user held on a past date stays the team the engine
    // resolves for that date.
    const from = await createTeam({ name: 'General' }, actor);
    const to = await createTeam({ name: 'GC' }, actor);
    const alice = await user({ teamId: String(from._id) });

    const moved = await moveUserTeam(
      String(alice._id),
      {
        teamId: String(to._id),
        effectiveFrom: '2026-06-01',
        reason: 'Reorganised',
      },
      alice.version,
      actor,
    );

    expect(moved.teamId).toBe(String(to._id));

    const assignments = await listTeamAssignments(String(alice._id));
    expect(assignments).toHaveLength(2);
    // The outgoing assignment is closed the day before the new one opens, so
    // no date is covered twice and none is left uncovered.
    expect(assignments[0]).toMatchObject({
      teamId: String(from._id),
      effectiveTo: '2026-05-31',
    });
    expect(assignments[1]).toMatchObject({
      teamId: String(to._id),
      effectiveFrom: '2026-06-01',
      effectiveTo: null,
    });
  });

  it('refuses a move with no effective date', async () => {
    const to = await createTeam({ name: 'GC' }, actor);
    const alice = await user();

    await expect(
      moveUserTeam(
        String(alice._id),
        { teamId: String(to._id), reason: 'Reorganised' },
        alice.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('names a replacement when the user manages the team they are leaving', async () => {
    // FR-3.14 and FR-3.1: the invariant must hold before and after.
    const from = await createTeam({ name: 'General' }, actor);
    const to = await createTeam({ name: 'GC' }, actor);
    const manager = await user({ teamId: String(from._id) });

    await changeUserRole(
      String(manager._id),
      {
        role: ROLES.MANAGER,
        teamId: String(from._id),
        reason: 'Promoted',
      },
      manager.version,
      actor,
    );

    const current = await getUserById(String(manager._id));

    await expect(
      moveUserTeam(
        String(manager._id),
        {
          teamId: String(to._id),
          effectiveFrom: '2026-06-01',
          reason: 'Reorganised',
        },
        current.version,
        actor,
      ),
    ).rejects.toThrow(/replacement/i);
  });
});

describe('assignUserShift', () => {
  useTestDatabase();

  it('records an assignment with an effective date range', async () => {
    // FR-3.6: a mid-year shift change is preserved historically.
    const alice = await user();

    await assignUserShift(
      String(alice._id),
      {
        shiftId: 'shift-1',
        effectiveFrom: '2026-01-05',
        effectiveTo: '2026-05-31',
        reason: 'Initial assignment',
      },
      alice.version,
      actor,
    );

    const assignments = await listShiftAssignments(String(alice._id));
    expect(assignments[0]).toMatchObject({
      shiftId: 'shift-1',
      effectiveFrom: '2026-01-05',
      effectiveTo: '2026-05-31',
    });
  });

  it('refuses a range ending before it starts', async () => {
    const alice = await user();

    await expect(
      assignUserShift(
        String(alice._id),
        {
          shiftId: 'shift-1',
          effectiveFrom: '2026-06-01',
          effectiveTo: '2026-01-01',
          reason: 'Wrong way round',
        },
        alice.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe('setUserFlag', () => {
  useTestDatabase();

  it('toggles tracked, and deletes no history', async () => {
    // FR-2.10: switching a user untracked is audited and removes nothing.
    const alice = await user();

    const untracked = await setUserFlag(
      String(alice._id),
      { field: 'tracked', value: false, reason: 'Administrative record only' },
      alice.version,
      actor,
    );

    expect(untracked.tracked).toBe(false);
  });

  it('toggles login enabled without touching anything else', async () => {
    // FR-1.5: revokes access while keeping the user and their history.
    const alice = await user();

    const revoked = await setUserFlag(
      String(alice._id),
      { field: 'loginEnabled', value: false, reason: 'On sabbatical' },
      alice.version,
      actor,
    );

    expect(revoked.loginEnabled).toBe(false);
    expect(revoked.deletedAt).toBeNull();
  });

  it('refuses a field that is not one of the two toggles', async () => {
    const alice = await user();

    await expect(
      setUserFlag(
        String(alice._id),
        { field: 'role', value: 'OFFICE_ADMIN', reason: 'Nice try' },
        alice.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe('tenures', () => {
  useTestDatabase();

  it('adds a second tenure and keeps the stored dates in step', async () => {
    // FR-2.12: date of joining is the earliest start, and both attributes are
    // rewritten in the same operation as any tenure change.
    const alice = await user();

    await createTenure(
      String(alice._id),
      { startDate: '2020-01-01', endDate: '2021-06-30', reason: 'Correction' },
      actor,
    );

    expect(await getUserById(String(alice._id))).toMatchObject({
      dateOfJoining: '2020-01-01',
      dateOfLeaving: null,
    });
  });

  it('refuses a tenure ending before it starts', async () => {
    const alice = await user();

    await expect(
      createTenure(
        String(alice._id),
        {
          startDate: '2026-06-01',
          endDate: '2026-01-01',
          reason: 'Wrong way round',
        },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a tenure overlapping another of the same user', async () => {
    const alice = await user();

    await expect(
      createTenure(
        String(alice._id),
        {
          startDate: '2026-03-01',
          endDate: '2026-09-01',
          reason: 'Overlaps the open one',
        },
        actor,
      ),
    ).rejects.toThrow(/overlap/i);
  });

  it('refuses to close an open tenure by editing it', async () => {
    // FR-2.12: an end date is set in one way only — by soft deleting the user.
    const alice = await getUserById(String((await user())._id));
    const [open] = alice.tenures;

    await expect(
      updateTenure(
        String(open._id),
        { endDate: '2026-09-01', reason: 'Trying it on' },
        open.version,
        actor,
      ),
    ).rejects.toThrow(/soft deleting the user/i);
  });

  it('corrects a wrong start date', async () => {
    const created = await user();
    const alice = await getUserById(String(created._id));
    const [open] = alice.tenures;

    await updateTenure(
      String(open._id),
      { startDate: '2026-01-06', reason: 'Off by a day' },
      open.version,
      actor,
    );

    expect(await getUserById(String(created._id))).toMatchObject({
      dateOfJoining: '2026-01-06',
    });
  });

  it('refuses to soft delete a user’s last remaining tenure', async () => {
    // FR-2.12: every user always keeps at least one that is not soft deleted.
    const created = await user();
    const alice = await getUserById(String(created._id));
    const [only] = alice.tenures;

    await expect(
      softDeleteTenure(
        String(only._id),
        { reason: 'Entered by mistake' },
        only.version,
        actor,
      ),
    ).rejects.toThrow(/last/i);
  });

  it('soft deletes a spare tenure and rewrites the stored dates', async () => {
    const created = await user();
    const spare = await createTenure(
      String(created._id),
      { startDate: '2020-01-01', endDate: '2021-06-30', reason: 'Correction' },
      actor,
    );

    await softDeleteTenure(
      String(spare._id),
      { reason: 'Entered against the wrong person' },
      spare.version,
      actor,
    );

    expect(await getUserById(String(created._id))).toMatchObject({
      dateOfJoining: '2026-01-05',
    });
  });

  it('rejects a tenure edit against a stale version', async () => {
    const created = await user();
    const alice = await getUserById(String(created._id));
    const [open] = alice.tenures;

    await updateTenure(
      String(open._id),
      { startDate: '2026-01-06', reason: 'First' },
      open.version,
      actor,
    );

    await expect(
      updateTenure(
        String(open._id),
        { startDate: '2026-01-07', reason: 'Second' },
        open.version,
        actor,
      ),
    ).rejects.toThrow(StaleWriteError);
  });
});

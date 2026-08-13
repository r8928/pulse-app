import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createTeam,
  createUser,
  getTeamById,
  listTeams,
  StaleWriteError,
  softDeleteTeam,
  updateTeam,
  updateUser,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-3.1 and FR-3.2. Teams are company-wide configuration, each with exactly
 * one manager, and a soft-deleted team stays readable so past day records
 * still resolve through the calendar and policy it held.
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

describe('teams', () => {
  useTestDatabase();

  it('creates a team and lists it with no members yet', async () => {
    await createTeam({ name: 'General' }, actor);
    const { items, total } = await listTeams();

    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ name: 'General', memberCount: 0 });
    expect(items[0].version).toBe(1);
  });

  it('counts members from the users assigned to it, excluding departed ones', async () => {
    // Totals exclude, rosters include (ARCHITECTURE 5.2) — a member count is a
    // total, so a departed colleague is not one of them.
    const team = await createTeam({ name: 'General' }, actor);
    await user({ teamId: String(team._id) });
    await user({
      employeeCode: 'EMP-002',
      fullName: 'Bob Brand',
      teamId: String(team._id),
    });

    const { items } = await listTeams();
    expect(items[0].memberCount).toBe(2);
  });

  it('rejects a second team of the same name', async () => {
    await createTeam({ name: 'General' }, actor);

    await expect(createTeam({ name: 'General' }, actor)).rejects.toThrow(
      /General/,
    );
  });

  it('rejects a team with no name', async () => {
    await expect(createTeam({ name: '  ' }, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it('makes the named manager a MANAGER in the same operation', async () => {
    // FR-1.7 and FR-3.1: exactly one manager per team, holding the role, and
    // the invariant must hold before and after whichever screen set it.
    const team = await createTeam({ name: 'GC' }, actor);
    const marcus = await user({
      fullName: 'Marcus Adeyemi',
      employeeCode: 'GC-001',
    });

    const updated = await updateTeam(
      String(team._id),
      { name: 'GC', managerId: String(marcus._id) },
      team.version,
      actor,
    );

    expect(updated.managerId).toBe(String(marcus._id));
    const { items } = await listTeams();
    expect(items[0].managerName).toBe('Marcus Adeyemi');
  });

  it('replaces the previous manager rather than leaving two', async () => {
    const team = await createTeam({ name: 'GC' }, actor);
    const first = await user({ fullName: 'First', employeeCode: 'A-1' });
    const second = await user({ fullName: 'Second', employeeCode: 'A-2' });

    const once = await updateTeam(
      String(team._id),
      { managerId: String(first._id) },
      team.version,
      actor,
    );
    const twice = await updateTeam(
      String(team._id),
      { managerId: String(second._id) },
      once.version,
      actor,
    );

    expect(twice.managerId).toBe(String(second._id));
  });

  it('leaves the manager unset rather than inventing one', async () => {
    // Design record D-5: spec.md names a manager for one seeded team only, so
    // the rest are prompted for under FR-3.13 and never guessed.
    const team = await createTeam({ name: 'General' }, actor);
    expect(team.managerId).toBeNull();
  });

  it('rejects an update against a stale version', async () => {
    const team = await createTeam({ name: 'General' }, actor);
    await updateTeam(String(team._id), { name: 'A' }, team.version, actor);

    await expect(
      updateTeam(String(team._id), { name: 'B' }, team.version, actor),
    ).rejects.toThrow(StaleWriteError);
  });

  it('refuses to soft delete a team while a serving user is assigned, naming them', async () => {
    // FR-3.2: those users are moved first, not deleted.
    const team = await createTeam({ name: 'General' }, actor);
    await user({ fullName: 'Rosa Delgado', teamId: String(team._id) });

    await expect(
      softDeleteTeam(
        String(team._id),
        { reason: 'Reorganised' },
        team.version,
        actor,
      ),
    ).rejects.toThrow(/Rosa Delgado/);
  });

  it('soft deletes a team whose only assignments are past', async () => {
    const team = await createTeam({ name: 'General' }, actor);
    const member = await user({ teamId: String(team._id) });
    await updateUser(
      String(member._id),
      { teamId: null },
      member.version,
      actor,
    );

    const deleted = await softDeleteTeam(
      String(team._id),
      { reason: 'Reorganised' },
      team.version,
      actor,
    );

    expect(deleted.deletedAt).toBeInstanceOf(Date);
  });

  it('keeps a soft-deleted team readable, so past records still resolve it', async () => {
    // FR-3.2: its calendar, weekly off pattern and policy must still answer
    // for the dates it was in force.
    const team = await createTeam({ name: 'General' }, actor);
    await softDeleteTeam(
      String(team._id),
      { reason: 'Reorganised' },
      team.version,
      actor,
    );

    expect(await getTeamById(String(team._id))).toMatchObject({
      name: 'General',
    });
    expect((await listTeams()).total).toBe(0);
    expect((await listTeams({ includeDeleted: true })).total).toBe(1);
  });

  it('requires a reason to soft delete', async () => {
    const team = await createTeam({ name: 'General' }, actor);

    await expect(
      softDeleteTeam(String(team._id), { reason: '' }, team.version, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('answers null for an id that does not exist', async () => {
    expect(await getTeamById('not-an-id')).toBeNull();
    expect(await updateTeam('not-an-id', { name: 'X' }, 1, actor)).toBeNull();
  });
});

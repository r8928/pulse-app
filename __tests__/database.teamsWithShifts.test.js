import { describe, expect, it } from 'vitest';
import {
  createShift,
  createTeam,
  listTeamsWithShifts,
  softDeleteShift,
  softDeleteTeam,
  updateTeam,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * What `P-08` needs to offer a team and a shift in one dialog (`FR-2.1`).
 *
 * A shift belongs to a team (`FR-3.3`), so the two cannot be read separately
 * and stitched together in the page — that would be one query per team, and
 * the dialog needs every team's shifts before the reader has chosen a team.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };
const reason = { reason: 'No longer in use' };

const shiftFor = (teamId, overrides = {}) => ({
  teamId,
  name: 'Day',
  startTime: '09:00',
  endTime: '18:00',
  requiredDailyMinutes: 540,
  graceMinutes: 30,
  timezone: 'Asia/Karachi',
  ...overrides,
});

describe('listTeamsWithShifts', () => {
  useTestDatabase();

  it('carries each team its own shifts', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    const gc = await createTeam({ name: 'GC' }, actor);

    await createShift(shiftFor(String(general._id)), actor);
    await createShift(
      shiftFor(String(gc._id), {
        name: 'Night',
        startTime: '19:00',
        endTime: '04:00',
      }),
      actor,
    );

    const teams = await listTeamsWithShifts();
    const byName = Object.fromEntries(teams.map((row) => [row.name, row]));

    expect(byName.General.shifts.map((shift) => shift.name)).toEqual(['Day']);
    expect(byName.GC.shifts.map((shift) => shift.name)).toEqual(['Night']);
  });

  it("names the team's default shift, which is what a joiner takes", async () => {
    // FR-3.4: a user with no shift of their own takes the team's.
    const general = await createTeam({ name: 'General' }, actor);
    const day = await createShift(shiftFor(String(general._id)), actor);
    await updateTeam(
      String(general._id),
      { defaultShiftId: String(day._id) },
      general.version,
      actor,
    );

    const [team] = await listTeamsWithShifts();

    expect(team.defaultShiftId).toBe(String(day._id));
  });

  it('offers no shift that has been soft deleted', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    const day = await createShift(shiftFor(String(general._id)), actor);
    await softDeleteShift(String(day._id), reason, day.version, actor);

    const [team] = await listTeamsWithShifts();

    expect(team.shifts).toEqual([]);
  });

  it('offers no team that has been soft deleted', async () => {
    // FR-2.4: a soft deleted team is never the subject of a new assignment.
    const general = await createTeam({ name: 'General' }, actor);
    await softDeleteTeam(String(general._id), reason, general.version, actor);

    expect(await listTeamsWithShifts()).toEqual([]);
  });

  it('carries a team that has no shift yet, rather than dropping it', async () => {
    // Dropping it would make an unconfigured team invisible to P-08, and the
    // dialog could not then say why it has no shift to offer (DC-6).
    await createTeam({ name: 'General' }, actor);

    const [team] = await listTeamsWithShifts();

    expect(team.name).toBe('General');
    expect(team.shifts).toEqual([]);
  });

  it('has nothing to offer before any team exists', async () => {
    expect(await listTeamsWithShifts()).toEqual([]);
  });

  it('hands back ids as strings, ready to cross into the client', async () => {
    // An ObjectId does not survive the server/client boundary as itself, and
    // P-08 is a client component.
    const general = await createTeam({ name: 'General' }, actor);
    await createShift(shiftFor(String(general._id)), actor);

    const [team] = await listTeamsWithShifts();

    expect(typeof team._id).toBe('string');
    expect(typeof team.shifts[0]._id).toBe('string');
  });
});

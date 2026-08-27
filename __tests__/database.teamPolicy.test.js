import { describe, expect, it } from 'vitest';
import {
  createShift,
  createTeam,
  getTeamConfiguration,
  getTeamPolicy,
  listShifts,
  StaleWriteError,
  softDeleteShift,
  updateShift,
  updateTeamPolicy,
  ValidationError,
} from '../database.js';
import { giveTeamACalendar } from '../test/calendar.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-3.3, FR-3.4, FR-3.7, FR-3.8 and FR-6.4. Everything on S-17: the per-team
 * half of the configuration list, all of it data and editable at runtime.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const shiftInput = (overrides = {}) => ({
  name: 'Day 09:00 to 18:00',
  startTime: '09:00',
  endTime: '18:00',
  requiredDailyMinutes: 540,
  graceMinutes: 30,
  timezone: 'Asia/Karachi',
  ...overrides,
});

const team = () => createTeam({ name: 'General' }, actor);

describe('shifts', () => {
  useTestDatabase();

  it('creates a shift belonging to a team', async () => {
    // FR-3.3: shifts are per team configuration, not global.
    const general = await team();
    const shift = await createShift(
      { ...shiftInput(), teamId: String(general._id) },
      actor,
    );

    expect(shift).toMatchObject({
      teamId: String(general._id),
      timezone: 'Asia/Karachi',
      version: 1,
    });
    expect((await listShifts(String(general._id))).total).toBe(1);
  });

  it('refuses a shift with no timezone, which no default may fill', async () => {
    // FR-3.10 and DC-5: there is no company-wide timezone to fall back to.
    const general = await team();

    await expect(
      createShift(
        { ...shiftInput({ timezone: '' }), teamId: String(general._id) },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('accepts an end time before its start, which is a night shift', async () => {
    // BR-3: a shift crossing midnight is ordinary, not an error.
    const general = await team();
    const night = await createShift(
      {
        ...shiftInput({
          name: 'GC night',
          startTime: '19:00',
          endTime: '04:00',
        }),
        teamId: String(general._id),
      },
      actor,
    );

    expect(night.endTime).toBe('04:00');
  });

  it('refuses a time that is not a 24-hour clock time', async () => {
    const general = await team();

    await expect(
      createShift(
        { ...shiftInput({ startTime: '9am' }), teamId: String(general._id) },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('edits a shift and rejects a stale version', async () => {
    const general = await team();
    const shift = await createShift(
      { ...shiftInput(), teamId: String(general._id) },
      actor,
    );

    const edited = await updateShift(
      String(shift._id),
      { graceMinutes: 15 },
      shift.version,
      actor,
    );
    expect(edited.graceMinutes).toBe(15);

    await expect(
      updateShift(String(shift._id), { graceMinutes: 5 }, shift.version, actor),
    ).rejects.toThrow(StaleWriteError);
  });

  it('soft deletes a shift and drops it from the live list only', async () => {
    const general = await team();
    const shift = await createShift(
      { ...shiftInput(), teamId: String(general._id) },
      actor,
    );

    await softDeleteShift(
      String(shift._id),
      { reason: 'Replaced' },
      shift.version,
      actor,
    );

    expect((await listShifts(String(general._id))).total).toBe(0);
    expect(
      (await listShifts(String(general._id), { includeDeleted: true })).total,
    ).toBe(1);
  });

  it('refuses to soft delete the shift a team defaults to', async () => {
    // FR-3.4: a user with no shift of their own takes the team default, so
    // removing it under them would leave the team unable to classify a day.
    const general = await team();
    const shift = await createShift(
      { ...shiftInput(), teamId: String(general._id) },
      actor,
    );
    const { updateTeam } = await import('../database.js');
    await updateTeam(
      String(general._id),
      { defaultShiftId: String(shift._id) },
      general.version,
      actor,
    );

    await expect(
      softDeleteShift(
        String(shift._id),
        { reason: 'Replaced' },
        shift.version,
        actor,
      ),
    ).rejects.toThrow(/default shift/i);
  });
});

describe('team policy', () => {
  useTestDatabase();

  it('starts absent rather than defaulted', async () => {
    // DC-6: an unset policy is prompted for, never filled in with a guess.
    const general = await team();
    expect(await getTeamPolicy(String(general._id))).toBeNull();
  });

  it('stores the ladders and thresholds as data', async () => {
    // FR-6.4 and I-3: no figure from spec.md 3.10 lives in a .js file.
    const general = await team();

    const policy = await updateTeamPolicy(
      String(general._id),
      {
        leaveTypes: [{ name: 'Annual', annualEntitlement: 10 }],
        shortDayThresholdPercent: 89,
        leaveDeductionLadder: [{ deduction: 0.25 }],
      },
      null,
      actor,
    );

    expect(policy.shortDayThresholdPercent).toBe(89);
    expect(policy.leaveTypes[0].annualEntitlement).toBe(10);
  });

  it('accepts a zero threshold as a set value', async () => {
    const general = await team();
    const policy = await updateTeamPolicy(
      String(general._id),
      { wfhQuotaDaysPerMonth: 0 },
      null,
      actor,
    );

    expect(policy.wfhQuotaDaysPerMonth).toBe(0);
  });

  it('refuses a negative threshold', async () => {
    const general = await team();

    await expect(
      updateTeamPolicy(
        String(general._id),
        { shortDayThresholdPercent: -1 },
        null,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an edit against a stale version', async () => {
    const general = await team();
    const first = await updateTeamPolicy(
      String(general._id),
      { ptoValidityDays: 30 },
      null,
      actor,
    );
    await updateTeamPolicy(
      String(general._id),
      { ptoValidityDays: 45 },
      first.version,
      actor,
    );

    await expect(
      updateTeamPolicy(
        String(general._id),
        { ptoValidityDays: 60 },
        first.version,
        actor,
      ),
    ).rejects.toThrow(StaleWriteError);
  });
});

describe('getTeamConfiguration', () => {
  useTestDatabase();

  it('gathers everything S-17 shows in one read', async () => {
    const general = await team();
    await createShift({ ...shiftInput(), teamId: String(general._id) }, actor);
    await giveTeamACalendar(String(general._id), { daysOfWeek: [6, 0] }, actor);

    const configuration = await getTeamConfiguration(String(general._id));

    expect(configuration.team.name).toBe('General');
    expect(configuration.shifts).toHaveLength(1);
    // FR-3.7: read through the calendar the team is assigned to, not its own.
    expect(configuration.calendar).not.toBeNull();
    expect(configuration.weeklyOffPattern.daysOfWeek).toEqual([6, 0]);
    expect(configuration.policy).toBeNull();
  });

  it('reports every gap in a brand-new team, so nothing is silently defaulted', async () => {
    // FR-3.13 and I-5, through the one detector S-05 reuses in Phase 6.
    const general = await team();
    const { gaps } = await getTeamConfiguration(String(general._id));

    expect(gaps.map((gap) => gap.field)).toEqual(
      expect.arrayContaining([
        'managerId',
        'shifts',
        'defaultShiftId',
        'calendarId',
        'midnightCrossingWindowHours',
        'duplicatePunchWindowMinutes',
      ]),
    );
  });

  it('answers null for a team that does not exist', async () => {
    expect(await getTeamConfiguration('not-an-id')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  assignUserShift,
  createShift,
  createTeam,
  createUser,
  listTrackedUserIds,
  loadRecalculationInputs,
  resolveTeamOnDate,
  updateTeamPolicy,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * ARCHITECTURE §8.2 and §23.3 step 1. The engine never reads policy itself,
 * so everything a recalculation needs is resolved here and handed over as
 * plain objects — which is also what lets the engine be tested without Mongo.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('resolveTeamOnDate', () => {
  const assignments = [
    {
      teamId: 'team-a',
      effectiveFrom: '2025-01-01',
      effectiveTo: '2026-05-31',
    },
    { teamId: 'team-b', effectiveFrom: '2026-06-01', effectiveTo: null },
  ];

  it('returns the team held ON the date, not the current one (§23.3 step 1)', () => {
    expect(resolveTeamOnDate(assignments, '2026-03-01', 'team-b')).toBe(
      'team-a',
    );
    expect(resolveTeamOnDate(assignments, '2026-07-01', 'team-b')).toBe(
      'team-b',
    );
  });

  it("falls back to the user's current team for a date before any assignment", () => {
    expect(resolveTeamOnDate(assignments, '2024-01-01', 'team-b')).toBe(
      'team-b',
    );
  });

  it('returns null when there is no assignment and no fallback', () => {
    expect(resolveTeamOnDate([], '2026-03-01', null)).toBeNull();
  });
});

describe('loadRecalculationInputs', () => {
  useTestDatabase();

  const aTeamWithPolicy = async (name, policy) => {
    const team = await createTeam({ name }, actor);
    await updateTeamPolicy(String(team._id), policy, null, actor);
    return team;
  };

  it('returns the policy, calendar and pattern of the team held on the date', async () => {
    const team = await aTeamWithPolicy('General', {
      automaticDeductionLeaveType: 'Casual',
      midnightCrossingWindowHours: 8,
    });

    const user = await createUser(
      {
        fullName: 'Loader Test',
        employeeCode: 'R-902',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
      },
      actor,
    );

    const inputs = await loadRecalculationInputs(String(user._id), {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    expect(inputs.user.employeeCode).toBe('R-902');
    expect(inputs.tenures).toHaveLength(1);
    expect(
      inputs.policyByTeam[String(team._id)].automaticDeductionLeaveType,
    ).toBe('Casual');
    expect(inputs.holidaysByTeam[String(team._id)]).toEqual([]);
  });

  it("attaches the team's crossing window to each shift, as resolveWorkDate requires", async () => {
    const team = await aTeamWithPolicy('Night', {
      midnightCrossingWindowHours: 8,
    });

    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Graveyard',
        startTime: '19:00',
        endTime: '04:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );

    const user = await createUser(
      {
        fullName: 'Night Worker',
        employeeCode: 'R-903',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );

    const inputs = await loadRecalculationInputs(String(user._id), {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    expect(inputs.shiftAssignments[0].shift.crossingWindowHours).toBe(8);
    expect(inputs.shiftAssignments[0].shift.startTime).toBe('19:00');
  });

  it('leaves an unset crossing window undefined rather than defaulting it (§8.3, DC-6)', async () => {
    const team = await createTeam({ name: 'Unconfigured' }, actor);
    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Days',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );

    const user = await createUser(
      {
        fullName: 'Unset Window',
        employeeCode: 'R-904',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );

    const inputs = await loadRecalculationInputs(String(user._id), {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    expect(
      inputs.shiftAssignments[0].shift.crossingWindowHours,
    ).toBeUndefined();
  });

  it('keeps the shift a user held before a re-assignment, with its own range (FR-3.6)', async () => {
    const team = await aTeamWithPolicy('Rotating', {
      midnightCrossingWindowHours: 8,
    });

    const day = await createShift(
      {
        teamId: String(team._id),
        name: 'Days',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );
    const night = await createShift(
      {
        teamId: String(team._id),
        name: 'Nights',
        startTime: '19:00',
        endTime: '04:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );

    const user = await createUser(
      {
        fullName: 'Rotated',
        employeeCode: 'R-905',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(day._id),
      },
      actor,
    );

    await assignUserShift(
      String(user._id),
      {
        shiftId: String(night._id),
        effectiveFrom: '2026-06-01',
        reason: 'Moved onto nights',
      },
      user.version,
      actor,
    );

    const inputs = await loadRecalculationInputs(String(user._id), {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    // A punch from March must still resolve against the day shift, so the
    // old assignment has to survive with an end date rather than vanish.
    const ranges = inputs.shiftAssignments.map((assignment) => [
      assignment.shift.name,
      assignment.effectiveFrom,
      assignment.effectiveTo,
    ]);

    expect(ranges).toEqual([
      ['Days', '2025-01-01', '2026-05-31'],
      ['Nights', '2026-06-01', null],
    ]);
  });

  it('returns null for a user who does not exist', async () => {
    expect(
      await loadRecalculationInputs('64b7f9c2f1a2b3c4d5e6f7a8', {
        from: '2026-08-12',
        to: '2026-08-12',
      }),
    ).toBeNull();
  });
});

describe('listTrackedUserIds', () => {
  useTestDatabase();

  it('returns only tracked, live users, and narrows to a team when asked', async () => {
    const team = await createTeam({ name: 'General' }, actor);
    const other = await createTeam({ name: 'Support' }, actor);

    const make = (code, overrides) =>
      createUser(
        {
          fullName: code,
          employeeCode: code,
          employmentType: 'PERMANENT',
          tracked: true,
          loginEnabled: true,
          role: ROLES.EMPLOYEE,
          dateOfJoining: '2025-01-01',
          teamId: String(team._id),
          ...overrides,
        },
        actor,
      );

    const tracked = await make('T-1');
    await make('T-2', { tracked: false });
    await make('T-3', { teamId: String(other._id) });

    const all = await listTrackedUserIds();
    expect(all).toHaveLength(2); // the untracked one is excluded (FR-2.10)

    const mine = await listTrackedUserIds({ teamId: String(team._id) });
    expect(mine).toEqual([String(tracked._id)]);
  });
});

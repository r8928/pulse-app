import { describe, expect, it } from 'vitest';
import { HOLIDAY_TYPE } from '../constants/index.js';
import {
  createHoliday,
  createHolidayCalendar,
  createTeam,
  getCalendarWeeklyOff,
  getHolidayCalendarById,
  getTeamById,
  getWeeklyOffPatternForTeam,
  listAuditRecords,
  listCalendarHolidays,
  listHolidayCalendars,
  listHolidayCalendarsWithDetail,
  listHolidaysForTeam,
  listTeamsOnCalendar,
  setCalendarTeams,
  setCalendarWeeklyOff,
  softDeleteHoliday,
  softDeleteHolidayCalendar,
  updateHolidayCalendar,
  updateTeam,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-3.7. A calendar is a company-wide record, not a per-team one — several
 * teams share it, and none of them owns it.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('holiday calendars', () => {
  useTestDatabase();

  it('creates a calendar carrying a name and nothing else', async () => {
    // D-33: no description, no timezone. The timezone the engine reads lives
    // on the shift, and a second one here is a source of drift with no reader.
    const calendar = await createHolidayCalendar(
      { name: 'India public holidays' },
      actor,
    );

    expect(calendar).toMatchObject({
      name: 'India public holidays',
      version: 1,
      deletedAt: null,
    });
    expect(calendar.timezone).toBeUndefined();
    expect((await listHolidayCalendars()).total).toBe(1);
  });

  it('refuses a calendar with no name', async () => {
    await expect(createHolidayCalendar({ name: '  ' }, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses a second live calendar with the same name', async () => {
    // Two calendars called "India" are indistinguishable in the picker that
    // assigns them (D-33).
    await createHolidayCalendar({ name: 'India' }, actor);

    await expect(
      createHolidayCalendar({ name: 'India' }, actor),
    ).rejects.toThrow(/already/i);
  });

  it('frees the name once a calendar is soft deleted', async () => {
    const first = await createHolidayCalendar({ name: 'India' }, actor);
    await softDeleteHolidayCalendar(
      String(first._id),
      { reason: 'Merged into the company calendar' },
      first.version,
      actor,
    );

    const second = await createHolidayCalendar({ name: 'India' }, actor);
    expect(second.name).toBe('India');
  });

  it('renames a calendar and bumps its version', async () => {
    const calendar = await createHolidayCalendar({ name: 'India' }, actor);
    const renamed = await updateHolidayCalendar(
      String(calendar._id),
      { name: 'India and Sri Lanka' },
      calendar.version,
      actor,
    );

    expect(renamed).toMatchObject({
      name: 'India and Sri Lanka',
      version: 2,
    });
  });

  it('refuses a rename onto another live calendar’s name', async () => {
    await createHolidayCalendar({ name: 'India' }, actor);
    const us = await createHolidayCalendar({ name: 'US' }, actor);

    await expect(
      updateHolidayCalendar(
        String(us._id),
        { name: 'India' },
        us.version,
        actor,
      ),
    ).rejects.toThrow(/already/i);
  });

  it('answers null for an id that is not a calendar', async () => {
    expect(await getHolidayCalendarById('not-an-object-id')).toBeNull();
    expect(
      await updateHolidayCalendar('not-an-object-id', { name: 'x' }, 1, actor),
    ).toBeNull();
  });

  it('hides a soft deleted calendar unless it is asked for', async () => {
    const calendar = await createHolidayCalendar({ name: 'India' }, actor);
    await softDeleteHolidayCalendar(
      String(calendar._id),
      { reason: 'No longer used' },
      calendar.version,
      actor,
    );

    expect((await listHolidayCalendars()).total).toBe(0);
    expect((await listHolidayCalendars({ includeDeleted: true })).total).toBe(
      1,
    );
  });
});

describe('holidays and the weekly off belong to a calendar', () => {
  useTestDatabase();

  const calendar = () =>
    createHolidayCalendar({ name: 'India public holidays' }, actor);

  it('creates a holiday against a calendar, not a team', async () => {
    const india = await calendar();
    const holiday = await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    expect(holiday).toMatchObject({
      calendarId: String(india._id),
      date: '2026-08-14',
      version: 1,
    });
    expect(holiday.teamId).toBeUndefined();
    expect((await listCalendarHolidays(String(india._id))).total).toBe(1);
  });

  it('refuses a holiday with no calendar', async () => {
    await expect(
      createHoliday(
        {
          date: '2026-08-14',
          name: 'Independence Day',
          type: HOLIDAY_TYPE.PUBLIC,
        },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a holiday with no type, so nothing depends on colour', async () => {
    // FR-3.7: a calendar shall never depend on formatting or colour, which
    // means the type is a stored value rather than a visual convention.
    const india = await calendar();

    await expect(
      createHoliday(
        {
          calendarId: String(india._id),
          date: '2026-03-23',
          name: 'Something',
          type: 'BANK_HOLIDAY',
        },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a date that is not a calendar date', async () => {
    const india = await calendar();

    await expect(
      createHoliday(
        {
          calendarId: String(india._id),
          date: '23-03-2026',
          name: 'Public holiday',
          type: HOLIDAY_TYPE.PUBLIC,
        },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('soft deletes a holiday rather than destroying it', async () => {
    const india = await calendar();
    const holiday = await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-03-23',
        name: 'Public holiday',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    await softDeleteHoliday(
      String(holiday._id),
      { reason: 'Announced in error' },
      holiday.version,
      actor,
    );

    expect((await listCalendarHolidays(String(india._id))).total).toBe(0);
    expect(
      (await listCalendarHolidays(String(india._id), { includeDeleted: true }))
        .total,
    ).toBe(1);
  });

  it('refuses a second holiday on one date on one calendar', async () => {
    const india = await calendar();
    const input = {
      calendarId: String(india._id),
      date: '2026-08-14',
      name: 'Independence Day',
      type: HOLIDAY_TYPE.PUBLIC,
    };
    await createHoliday(input, actor);

    await expect(
      createHoliday({ ...input, name: 'Something else' }, actor),
    ).rejects.toThrow(/already observes/i);
  });

  it('lets two calendars observe different days on the same date', async () => {
    // FR-3.7 survives the move: the difference is now between calendars.
    const india = await calendar();
    const us = await createHolidayCalendar(
      { name: 'US public holidays' },
      actor,
    );

    await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    expect((await listCalendarHolidays(String(india._id))).total).toBe(1);
    expect((await listCalendarHolidays(String(us._id))).total).toBe(0);
  });

  it('sets a weekly off pattern on the calendar', async () => {
    const india = await calendar();
    const pattern = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0, 6] },
      null,
      actor,
    );

    expect(pattern).toMatchObject({
      calendarId: String(india._id),
      daysOfWeek: [0, 6],
      version: 1,
    });
    expect(pattern.teamId).toBeUndefined();
  });

  it('accepts an empty pattern, which is a real answer', async () => {
    // FR-3.8: a calendar whose teams work every day.
    const india = await calendar();
    const pattern = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [] },
      null,
      actor,
    );

    expect(pattern.daysOfWeek).toEqual([]);
    expect(await getCalendarWeeklyOff(String(india._id))).not.toBeNull();
  });

  it('replaces the pattern in place rather than adding a second', async () => {
    const india = await calendar();
    const first = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0] },
      null,
      actor,
    );
    const second = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0, 6] },
      first.version,
      actor,
    );

    expect(second._id).toEqual(first._id);
    expect(second).toMatchObject({ daysOfWeek: [0, 6], version: 2 });
  });
});

describe('the team-facing read seam', () => {
  useTestDatabase();

  it('reads the assigned calendar’s holidays for a team', async () => {
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await updateTeam(
      String(general._id),
      { calendarId: String(india._id) },
      general.version,
      actor,
    );

    await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );
    await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0] },
      null,
      actor,
    );

    expect((await listHolidaysForTeam(String(general._id))).total).toBe(1);
    expect(
      (await getWeeklyOffPatternForTeam(String(general._id))).daysOfWeek,
    ).toEqual([0]);
  });

  it('reads nothing for a team with no calendar, and never a weekend', async () => {
    // D-29: no default calendar and no fallback. Defaulting to Saturday and
    // Sunday is the exact assumption FR-3.8 forbids.
    const general = await createTeam({ name: 'General' }, actor);

    expect(await listHolidaysForTeam(String(general._id))).toEqual({
      items: [],
      total: 0,
    });
    expect(await getWeeklyOffPatternForTeam(String(general._id))).toBeNull();
  });
});

describe('assigning teams to a calendar', () => {
  useTestDatabase();

  const setUp = async () => ({
    india: await createHolidayCalendar({ name: 'India' }, actor),
    us: await createHolidayCalendar({ name: 'US' }, actor),
    general: await createTeam({ name: 'General' }, actor),
    support: await createTeam({ name: 'Support' }, actor),
  });

  it('assigns teams and reports which joined', async () => {
    const { india, general, support } = await setUp();

    const result = await setCalendarTeams(
      String(india._id),
      [String(general._id), String(support._id)],
      actor,
    );

    expect(result.joined.sort()).toEqual(
      [String(general._id), String(support._id)].sort(),
    );
    expect(result.left).toEqual([]);
    expect((await listTeamsOnCalendar(String(india._id))).length).toBe(2);
  });

  it('reports the teams that left when they are omitted', async () => {
    const { india, general, support } = await setUp();
    await setCalendarTeams(
      String(india._id),
      [String(general._id), String(support._id)],
      actor,
    );

    const result = await setCalendarTeams(
      String(india._id),
      [String(general._id)],
      actor,
    );

    expect(result.joined).toEqual([]);
    expect(result.left).toEqual([String(support._id)]);
    expect((await getTeamById(String(support._id))).calendarId).toBeNull();
  });

  it('moves a team off the calendar it was on', async () => {
    // A team holds at most one calendar, and single-valued storage makes that
    // unbreakable rather than merely enforced (D-31).
    const { india, us, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);
    await setCalendarTeams(String(us._id), [String(general._id)], actor);

    expect((await listTeamsOnCalendar(String(india._id))).length).toBe(0);
    expect((await getTeamById(String(general._id))).calendarId).toBe(
      String(us._id),
    );
  });

  it('is a no-op given the list it already holds', async () => {
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const result = await setCalendarTeams(
      String(india._id),
      [String(general._id)],
      actor,
    );

    expect(result).toEqual({ joined: [], left: [] });
  });

  it('audits every team whose calendar changed', async () => {
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const { items } = await listAuditRecords({
      entityType: 'team',
      entityId: String(general._id),
    });

    expect(
      items.some((record) => record.action === 'TEAM_CALENDAR_ASSIGNED'),
    ).toBe(true);
  });

  it('refuses to soft delete a calendar while a team is assigned', async () => {
    // D-30: one click, and every team on it loses its working week at once.
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    await expect(
      softDeleteHolidayCalendar(
        String(india._id),
        { reason: 'No longer used' },
        india.version,
        actor,
      ),
    ).rejects.toThrow(/General/);
  });

  it('permits the delete once no team is assigned', async () => {
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);
    await setCalendarTeams(String(india._id), [], actor);

    const removed = await softDeleteHolidayCalendar(
      String(india._id),
      { reason: 'Merged into the company calendar' },
      india.version,
      actor,
    );

    expect(removed.deletedAt).not.toBeNull();
  });
});

describe('listHolidayCalendarsWithDetail', () => {
  useTestDatabase();

  it('gathers every calendar, its contents and its teams in one read', async () => {
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);
    await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0, 6] },
      null,
      actor,
    );
    await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    const { calendars, teams } = await listHolidayCalendarsWithDetail();

    expect(calendars).toHaveLength(1);
    expect(calendars[0].teams).toEqual([
      { _id: String(general._id), name: 'General' },
    ]);
    expect(calendars[0].holidays).toHaveLength(1);
    expect(calendars[0].weeklyOffPattern.daysOfWeek).toEqual([0, 6]);
    expect(teams[0]).toMatchObject({
      name: 'General',
      calendarId: String(india._id),
      calendarName: 'India',
    });
  });

  it('names no calendar for a team assigned to none', async () => {
    const general = await createTeam({ name: 'General' }, actor);

    const { teams } = await listHolidayCalendarsWithDetail();

    expect(teams).toEqual([
      {
        _id: String(general._id),
        name: 'General',
        calendarId: null,
        calendarName: null,
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { HOLIDAY_TYPE } from '../constants/index.js';
import {
  COLLECTIONS,
  createTeam,
  DEFAULT_COMPANY_ID,
  getDb,
  getTeamById,
  getWeeklyOffPatternForTeam,
  listHolidayCalendars,
  listHolidaysForTeam,
  migrateTeamCalendars,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * D-34. Records written while a calendar belonged to a team keep working the
 * day the shared-calendar change ships. Nothing is merged automatically — four
 * seeded teams observe deliberately different days, and a script cannot know
 * which of those differences were intentional.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

/** A holiday and a pattern in the old per-team shape, written straight in. */
const legacyRecords = async (teamId) => {
  const db = await getDb();

  await db.collection(COLLECTIONS.HOLIDAYS).insertOne({
    teamId,
    date: '2026-08-14',
    name: 'Independence Day',
    type: HOLIDAY_TYPE.PUBLIC,
    companyId: DEFAULT_COMPANY_ID,
    deletedAt: null,
    version: 1,
  });

  await db.collection(COLLECTIONS.WEEKLY_OFF_PATTERNS).insertOne({
    teamId,
    daysOfWeek: [0, 6],
    companyId: DEFAULT_COMPANY_ID,
    version: 1,
  });
};

describe('migrating per-team calendars', () => {
  useTestDatabase();

  it('creates one calendar per team and moves its records onto it', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    await legacyRecords(String(general._id));

    const result = await migrateTeamCalendars(actor);

    expect(result).toMatchObject({
      calendarsCreated: 1,
      holidaysMoved: 1,
      patternsMoved: 1,
      teamsAssigned: 1,
    });

    const [calendar] = (await listHolidayCalendars()).items;
    expect(calendar.name).toBe('General calendar');
    expect((await getTeamById(String(general._id))).calendarId).toBe(
      String(calendar._id),
    );
    expect((await listHolidaysForTeam(String(general._id))).total).toBe(1);
    expect(
      (await getWeeklyOffPatternForTeam(String(general._id))).daysOfWeek,
    ).toEqual([0, 6]);
  });

  it('keeps two teams apart rather than merging them', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    const support = await createTeam({ name: 'Support' }, actor);
    await legacyRecords(String(general._id));
    await legacyRecords(String(support._id));

    await migrateTeamCalendars(actor);

    expect((await listHolidayCalendars()).total).toBe(2);
  });

  it('creates nothing for a team holding neither', async () => {
    await createTeam({ name: 'General' }, actor);

    expect(await migrateTeamCalendars(actor)).toMatchObject({
      calendarsCreated: 0,
      teamsAssigned: 0,
    });
    expect((await listHolidayCalendars()).total).toBe(0);
  });

  it('leaves a record whose team is gone rather than destroying it', async () => {
    // I-1: nothing is destroyed. A holiday whose team no longer exists keeps
    // its data and simply finds no calendar to move to.
    await legacyRecords('64b7f9c2a1b2c3d4e5f60718');

    expect(await migrateTeamCalendars(actor)).toMatchObject({
      calendarsCreated: 0,
      holidaysMoved: 0,
    });

    const db = await getDb();
    expect(await db.collection(COLLECTIONS.HOLIDAYS).countDocuments()).toBe(1);
  });

  it('is idempotent', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    await legacyRecords(String(general._id));

    await migrateTeamCalendars(actor);
    const second = await migrateTeamCalendars(actor);

    expect(second).toMatchObject({
      calendarsCreated: 0,
      holidaysMoved: 0,
      patternsMoved: 0,
    });
    expect((await listHolidayCalendars()).total).toBe(1);
  });
});

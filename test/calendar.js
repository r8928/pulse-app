import {
  createHoliday,
  createHolidayCalendar,
  getTeamById,
  setCalendarTeams,
  setCalendarWeeklyOff,
} from '../database.js';

/**
 * Gives one team a calendar of its own, and puts a weekly off pattern and any
 * holidays on it.
 *
 * Holidays and the pattern belong to a calendar rather than a team
 * (`FR-3.7`, `FR-3.8`), so a fixture that used to write them straight onto the
 * team now has three steps instead of one. Extracted here because a dozen test
 * files need the same three, and a dozen copies of them would be a dozen
 * places to forget the assignment — which fails silently as "this team
 * observes nothing" rather than loudly.
 *
 * It deliberately does NOT reach for a shared calendar. Each call makes its
 * own, so one file's fixture can never change what another file's team
 * observes.
 */
let sequence = 0;

export async function giveTeamACalendar(
  teamId,
  { daysOfWeek = [], holidays = [] } = {},
  actor,
) {
  sequence += 1;

  const calendar = await createHolidayCalendar(
    { name: `Test calendar ${sequence}` },
    actor,
  );
  const calendarId = String(calendar._id);

  await setCalendarTeams(calendarId, [teamId], actor);

  await setCalendarWeeklyOff(calendarId, { daysOfWeek }, null, actor);

  for (const holiday of holidays) {
    await createHoliday({ ...holiday, calendarId }, actor);
  }

  return calendar;
}

/**
 * The calendar a team is already on, for a fixture that wants to add one more
 * holiday to it after `giveTeamACalendar` has run.
 */
export async function calendarIdForTeam(teamId) {
  const team = await getTeamById(teamId);
  return team?.calendarId ?? null;
}

import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { DAY_TYPE } from '../constants/index.js';
import { isWithinEmploymentPeriod } from '../utils/employment.js';
import { resolveDayType } from './classify.js';

/**
 * `FR-3.9`, MVP criterion 19. Working-day and holiday counts for a period,
 * derived from the calendar of **the team the user held on each date** — not
 * their current team.
 *
 * This cannot be a `$group` in the database, which is why it is here: a user
 * who moved teams mid-period has two calendars over one range, and which one
 * applies depends on the date being asked about. A count taken against the
 * current team is wrong for every date before the move.
 *
 * Pure. Every input is passed in and nothing is fetched (§8.2), and it reuses
 * `resolveDayType` rather than re-deriving one — a report that classified a
 * date differently from the day record for that date is exactly the drift
 * `NFR-8` forbids.
 *
 * Dates outside the employment period count as nothing at all. They are not
 * absence (`FR-2.12`): the person was not there.
 */
export function countCalendarDays({
  from,
  to,
  tenures,
  teamAssignments,
  fallbackTeamId = null,
  holidaysByTeam = {},
  weeklyOffByTeam = {},
}) {
  const counts = {
    workingDays: 0,
    holidays: 0,
    weeklyOffDays: 0,
    daysInPeriod: 0,
  };

  const dates = eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  }).map((day) => format(day, 'yyyy-MM-dd'));

  for (const date of dates) {
    if (!isWithinEmploymentPeriod(tenures, date)) continue;
    counts.daysInPeriod += 1;

    const teamId = teamIdOn(teamAssignments, date, fallbackTeamId);
    const dayType = resolveDayType(
      date,
      holidaysByTeam[teamId] ?? [],
      weeklyOffByTeam[teamId] ?? null,
    );

    if (dayType === DAY_TYPE.HOLIDAY) counts.holidays += 1;
    else if (dayType === DAY_TYPE.WEEKLY_OFF) counts.weeklyOffDays += 1;
    else counts.workingDays += 1;
  }

  return counts;
}

/**
 * The same rule `recalculateOneDay` step 1 applies, kept here rather than
 * imported from `database.js` so this file fetches nothing and stays pure.
 */
function teamIdOn(teamAssignments, date, fallbackTeamId) {
  const covering = (teamAssignments ?? []).find(
    (assignment) =>
      assignment.effectiveFrom <= date &&
      (assignment.effectiveTo === null || assignment.effectiveTo >= date),
  );

  return covering?.teamId ?? fallbackTeamId ?? null;
}

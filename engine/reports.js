import { endOfMonth, endOfYear, format, startOfYear } from 'date-fns';
import {
  getUserById,
  getWeeklyOffPattern,
  listHolidays,
  listTeamAssignments,
  listTenures,
  replayBalance,
  summariseAttendance,
} from '../database.js';
import { countCalendarDays } from './calendarDays.js';
import { PTO_LEAVE_TYPE } from './pto.js';

/**
 * `FR-8.3` and `FR-8.4`. `S-20`'s report and `S-21`'s year.
 *
 * `summariseAttendance` already totals what the engine concluded, in the
 * database, because `NFR-3` puts a full-company month under two seconds. What
 * it cannot do is `FR-3.9`'s calendar counts: those depend on the team the
 * user held on **each date**, which is per-user history rather than a `$group`
 * over day records. So this joins the two — the aggregate for what happened,
 * `countCalendarDays` for what was expected.
 */

/** Every input `countCalendarDays` needs for one user, in one read each. */
async function calendarInputsFor(userId, user) {
  const [tenures, teamAssignments] = await Promise.all([
    listTenures(userId),
    listTeamAssignments(userId),
  ]);

  const teamIds = [
    ...new Set([
      ...teamAssignments.map((assignment) => assignment.teamId),
      user.teamId,
    ]),
  ].filter(Boolean);

  const holidaysByTeam = {};
  const weeklyOffByTeam = {};

  for (const teamId of teamIds) {
    holidaysByTeam[teamId] = (await listHolidays(teamId)).items;
    weeklyOffByTeam[teamId] = await getWeeklyOffPattern(teamId);
  }

  return {
    tenures,
    teamAssignments,
    fallbackTeamId: user.teamId,
    holidaysByTeam,
    weeklyOffByTeam,
  };
}

/**
 * `S-20`. Any date range, not only a calendar month (MVP criterion 10).
 *
 * `FR-2.10`: untracked colleagues contribute nothing and are **counted**, so
 * the screen states the exclusion rather than leaving it silent. `FR-2.4`: a
 * soft-deleted colleague appears with unchanged totals, marked — a departure
 * bounds which dates exist for them, never what happened on the dates that do.
 */
export async function buildAttendanceReport({
  from,
  to,
  teamId = null,
  userId = null,
  includeDeleted = true,
}) {
  const { rows, untrackedCount } = await summariseAttendance({
    from,
    to,
    teamId,
    userId,
    includeDeleted,
  });

  const withCalendars = [];

  for (const row of rows) {
    const user = await getUserById(row.userId);
    if (!user) continue;

    const counts = countCalendarDays({
      from,
      to,
      ...(await calendarInputsFor(row.userId, user)),
    });

    withCalendars.push({
      ...row,
      ...counts,
      // FR-2.4: marked rather than hidden, and its totals stand.
      noLongerActive: Boolean(row.deletedAt),
      pto: await replayBalance(row.userId, PTO_LEAVE_TYPE, to),
    });
  }

  return { rows: withCalendars, untrackedCount, from, to };
}

/**
 * `S-21`, `FR-8.4`. One colleague's year, month by month.
 *
 * **Every month is present.** A month with no data is an explicit zero row
 * and is never silently omitted — this is workbook defect `F1`, and the
 * reason `S-21` exists in the shape it does (MVP criterion 9). A month
 * outside the employment period is marked as such rather than shown as
 * absence, which is a different thing entirely.
 */
export async function buildAnnualSummary(userId, year) {
  const user = await getUserById(userId);
  if (!user) return null;

  const inputs = await calendarInputsFor(userId, user);
  const yearStart = startOfYear(new Date(year, 0, 1));

  const months = [];

  for (let month = 0; month < 12; month++) {
    const first = new Date(year, month, 1);
    const from = format(first, 'yyyy-MM-01');
    const to = format(endOfMonth(first), 'yyyy-MM-dd');

    const counts = countCalendarDays({ from, to, ...inputs });
    const { rows } = await summariseAttendance({
      from,
      to,
      userId,
      includeDeleted: true,
    });
    const totals = rows[0] ?? {};

    months.push({
      month: month + 1,
      label: format(first, 'MMMM'),
      // The distinction defect F1 got wrong: a month nobody worked is not the
      // same as a month before they joined.
      inEmploymentPeriod: counts.daysInPeriod > 0,
      workingDays: counts.workingDays,
      holidays: counts.holidays,
      present: totals.present ?? 0,
      absent: totals.absent ?? 0,
      wfh: totals.wfh ?? 0,
      leave: totals.leave ?? 0,
      lateDays: totals.lateDays ?? 0,
      shortDays: totals.shortDays ?? 0,
      holidayWork: totals.holidayWork ?? 0,
    });
  }

  return {
    user: {
      _id: String(user._id),
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      noLongerActive: Boolean(user.deletedAt),
    },
    year,
    months,
    pto: await replayBalance(
      userId,
      PTO_LEAVE_TYPE,
      format(endOfYear(yearStart), 'yyyy-MM-dd'),
    ),
  };
}

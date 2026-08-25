import { endOfMonth, endOfYear, format, startOfYear } from 'date-fns';
import {
  getTeamPolicy,
  getUserById,
  getWeeklyOffPattern,
  listHolidays,
  listTeamAssignments,
  listTeamAssignmentsForUsers,
  listTenures,
  listTenuresForUsers,
  replayBalance,
  summariseAttendance,
  summariseBalances,
} from '../database.js';
import { countCalendarDays } from './calendarDays.js';
import { WFH_LEAVE_TYPE } from './ledger.js';
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
 * Page 1's single table: what the engine concluded, what the calendar
 * expected, and what every balance stands at — for a whole roster over one
 * period.
 *
 * It is the merge of what used to be three screens (`S-09` attendance,
 * `S-13` balances, `S-20` the report builder). They were never independent:
 * a reader comparing absences against a leave balance had to hold two tabs
 * open and trust that both were filtered the same way. One row per colleague
 * removes the question.
 *
 * `FR-2.10`: untracked colleagues contribute nothing and are **counted**, so
 * the screen states the exclusion rather than leaving it silent. `FR-2.4`: a
 * soft-deleted colleague appears with unchanged totals, marked — a departure
 * bounds which dates exist for them, never what happened on the dates that do.
 */
export async function buildAttendanceSummary({
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

  if (rows.length === 0) return { rows: [], untrackedCount, from, to };

  const userIds = rows.map((row) => row.userId);

  /**
   * Three batched reads rather than three per colleague.
   *
   * The per-user form of each of these still exists and is still right for a
   * single-colleague screen. Here the roster is the unit, and `NFR-3` puts a
   * full-company month under two seconds at p95 — a budget a loop of round
   * trips spends long before the roster is large enough for anyone to notice
   * it happening.
   */
  const [tenuresByUser, assignmentsByUser, balances] = await Promise.all([
    listTenuresForUsers(userIds),
    listTeamAssignmentsForUsers(userIds),
    summariseBalances({ userIds, from, to }),
  ]);

  const calendars = new TeamCalendarCache();
  const policies = new TeamPolicyCache();
  const withCalendars = [];

  for (const row of rows) {
    const user = await getUserById(row.userId);
    if (!user) continue;

    const tenures = tenuresByUser.get(row.userId) ?? [];
    const teamAssignments = assignmentsByUser.get(row.userId) ?? [];

    const counts = countCalendarDays({
      from,
      to,
      tenures,
      teamAssignments,
      fallbackTeamId: user.teamId,
      ...(await calendars.forTeams([
        ...teamAssignments.map((assignment) => assignment.teamId),
        user.teamId,
      ])),
    });

    withCalendars.push({
      ...row,
      ...counts,
      // FR-2.4: marked rather than hidden, and its totals stand.
      noLongerActive: Boolean(row.deletedAt),
      pto: await replayBalance(row.userId, PTO_LEAVE_TYPE, to),
      balancesByType: balancesFor(balances.rows, row.userId),
      /**
       * `BR-16` caps work-from-home as a monthly QUOTA rather than a balance,
       * so the count means little without the ceiling it is counted against.
       *
       * The quota belongs to the team the colleague holds now, read once per
       * team however many people share it. An unset one stays null: `DC-6`
       * says an unconfigured value is stated as unknown, never guessed at.
       */
      wfhQuota: await policies.quotaFor(user.teamId),
    });
  }

  return { rows: withCalendars, untrackedCount, from, to };
}

/**
 * One colleague's balances, keyed by leave type.
 *
 * `FR-6.4` makes the type list editable at runtime, so the caller reads the
 * types off this rather than off today's policy — a type no longer offered
 * still shows the days already taken under it. The WFH pseudo-type is a quota
 * count rather than a balance (`D-13`) and has its own column, so it is kept
 * out.
 */
function balancesFor(balanceRows, userId) {
  const byType = {};

  for (const balance of balanceRows) {
    if (balance.userId !== userId) continue;
    if (balance.leaveType === WFH_LEAVE_TYPE) continue;
    if (balance.leaveType === PTO_LEAVE_TYPE) continue;

    byType[balance.leaveType] = {
      opening: balance.opening,
      credited: balance.credited,
      availed: balance.availed,
      deductions: balance.deductions,
      ctoApplied: balance.ctoApplied,
      balance: balance.balance,
    };
  }

  return byType;
}

/**
 * A team's work-from-home quota, read once however many colleagues share it.
 *
 * Same lifetime as the calendar cache beside it — one build, then discarded.
 * A team with no policy, or a policy with no quota set, answers null rather
 * than a number nobody configured (`DC-6`).
 */
class TeamPolicyCache {
  #quotas = new Map();

  async quotaFor(teamId) {
    if (!teamId) return null;

    if (!this.#quotas.has(teamId)) {
      const policy = await getTeamPolicy(teamId);
      this.#quotas.set(teamId, policy?.wfhQuotaDaysPerMonth ?? null);
    }

    return this.#quotas.get(teamId);
  }
}

/**
 * A team's holidays and weekly-off pattern, read once however many colleagues
 * share it.
 *
 * A roster of fifty across four teams is four pairs of reads rather than a
 * hundred. The cache lives for one build and is thrown away with it — holding
 * it longer would serve a stale calendar to the next request, which is the
 * bug `README.md` warns about for permission grants for the same reason.
 */
class TeamCalendarCache {
  #holidays = new Map();
  #weeklyOff = new Map();

  async forTeams(teamIds) {
    const holidaysByTeam = {};
    const weeklyOffByTeam = {};

    for (const teamId of new Set(teamIds.filter(Boolean))) {
      if (!this.#holidays.has(teamId)) {
        this.#holidays.set(teamId, (await listHolidays(teamId)).items);
        this.#weeklyOff.set(teamId, await getWeeklyOffPattern(teamId));
      }

      holidaysByTeam[teamId] = this.#holidays.get(teamId);
      weeklyOffByTeam[teamId] = this.#weeklyOff.get(teamId);
    }

    return { holidaysByTeam, weeklyOffByTeam };
  }
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

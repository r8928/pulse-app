import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { format } from 'date-fns';
import { rosterFiltersFor } from '../../../../authz/rosterScope.js';
import { AttendanceGrid } from '../../../../components/attendance/AttendanceGrid.jsx';
import { DailyAttendanceFilters } from '../../../../components/attendance/DailyAttendanceFilters.jsx';
import { DayByDayTable } from '../../../../components/attendance/DayByDayTable.jsx';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { DAILY_VIEW, PERMISSIONS } from '../../../../constants/index.js';
import {
  getTeamPolicy,
  listTeams,
  listTrackedUserIds,
  listUsers,
  loadAttendanceGrid,
} from '../../../../database.js';
import { buildDayByDay } from '../../../../engine/dayByDay.js';
import { recalculateDays } from '../../../../engine/recalculate.js';
import { getSessionUser } from '../../../../session.js';
import { periodFromSearchParams } from '../../../../utils/period.js';

/**
 * Page 2 — Daily Attendance, in two views.
 *
 * **By date** (`S-10`) is the editing surface: one team, one date, correctable.
 * Opening it is what `D-15` calls a touch — every tracked member of that team
 * gets a record for that date, ABSENT included. Nothing else in the system
 * backfills.
 *
 * **Day by day** is read only: every date in a period for whoever is selected,
 * in the shape of the workbook it replaces.
 *
 * Only one of the two is rendered, chosen by the URL. That is not a
 * convenience — the by-date grid WRITES when it opens, and a hidden tab that
 * materialises a team's month on the way past would be a side effect nobody
 * asked for.
 */
export default async function DailyAttendancePage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const canWrite = Boolean(viewer?.permissions[PERMISSIONS.ATTENDANCE_WRITE]);

  // A reader has one view available, so that is the one they get whatever the
  // URL asks for — the alternative is a 403 from clicking a visible tab.
  const view =
    canWrite && params?.view === DAILY_VIEW.BY_DATE
      ? DAILY_VIEW.BY_DATE
      : DAILY_VIEW.DAY_BY_DAY;

  const period = periodFromSearchParams(params);
  const scoped = rosterFiltersFor(
    viewer.permissions[PERMISSIONS.ATTENDANCE_READ],
    viewer,
    { teamId: params?.teamId },
  );

  const [teams, roster] = await Promise.all([
    listTeams({ includeDeleted: false, pageSize: 200 }),
    listUsers({
      includeDeleted: false,
      pageSize: 500,
      teamId: scoped.teamId ?? undefined,
    }),
  ]);

  const header = (
    <PageHeader
      title='Daily attendance'
      description='One date at a time to enter and correct, or a whole period day by day to read. Untracked colleagues appear in neither — they receive no day records at all.'
    />
  );

  const filters = (
    <DailyAttendanceFilters
      view={view}
      canWrite={canWrite}
      teams={teams.items.map((team) => ({
        _id: String(team._id),
        name: team.name,
      }))}
      people={roster.items.map((person) => ({
        _id: String(person._id),
        fullName: person.fullName,
      }))}
      period={period}
      filters={{
        teamId: scoped.teamId ?? params?.teamId ?? '',
        date: params?.date ?? format(new Date(), 'yyyy-MM-dd'),
        userIds: (params?.userIds ?? '').split(',').filter(Boolean),
      }}
    />
  );

  if (view === DAILY_VIEW.BY_DATE) {
    return (
      <Stack spacing={3}>
        {header}
        {filters}
        <ByDateView params={params} teams={teams} viewer={viewer} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {header}
      {filters}
      <DayByDayView params={params} period={period} scoped={scoped} />
    </Stack>
  );
}

/** `S-10` unchanged: one team, one date, correctable. */
async function ByDateView({ params, teams, viewer }) {
  const teamId =
    params?.teamId ?? viewer?.teamId ?? teams.items[0]?._id ?? null;
  const date = params?.date ?? format(new Date(), 'yyyy-MM-dd');

  if (!teamId) {
    return (
      <Alert severity='info'>
        No team exists yet. A day cannot be classified without one: a team
        carries the shifts, calendar and weekly-off pattern every record
        resolves through.
      </Alert>
    );
  }

  await recalculateDays(
    null,
    { from: date, to: date },
    {
      teamId: String(teamId),
      materialiseUsers: await listTrackedUserIds({ teamId: String(teamId) }),
      actor: { userId: viewer.userId, name: viewer.name },
      reason: 'Attendance opened for this team and date',
    },
  );

  const [{ rows, untrackedCount }, policy] = await Promise.all([
    loadAttendanceGrid(String(teamId), date),
    getTeamPolicy(String(teamId)),
  ]);

  return (
    <AttendanceGrid
      rows={rows.map((row) => ({
        user: {
          _id: String(row.user._id),
          fullName: row.user.fullName,
          employeeCode: row.user.employeeCode,
        },
        dayRecord: {
          _id: String(row.dayRecord._id),
          date: row.dayRecord.date,
          version: row.dayRecord.version,
          dayType: row.dayRecord.dayType,
          computed: row.dayRecord.computed,
          override: row.dayRecord.override,
          exceptions: row.dayRecord.exceptions ?? [],
        },
        punches: row.punches.map((punch) => ({
          _id: String(punch._id),
          type: punch.type,
          at: punch.at.toISOString(),
          isDuplicate: punch.isDuplicate,
          deletedAt: punch.deletedAt ? punch.deletedAt.toISOString() : null,
        })),
        shift: row.shift
          ? { _id: String(row.shift._id), timezone: row.shift.timezone }
          : null,
      }))}
      date={date}
      canWrite
      leaveTypes={policy?.leaveTypes ?? []}
      untrackedCount={untrackedCount}
    />
  );
}

/**
 * Every date in the period for whoever is selected.
 *
 * An explicit selection wins; otherwise the team filter's tracked members do.
 * Untracked colleagues never appear — they receive no day records, so every
 * row would be empty and would read as absence rather than as exclusion
 * (`FR-2.10`).
 */
async function DayByDayView({ params, period, scoped }) {
  const chosen = (params?.userIds ?? '').split(',').filter(Boolean);

  /**
   * Somebody has to be asked for. An unfiltered view would be every tracked
   * colleague in the company times every date in the period — a query nobody
   * meant to run, and a table nobody can read. The empty state says which
   * control to reach for instead.
   */
  const userIds = chosen.length
    ? chosen
    : scoped.userId
      ? [scoped.userId]
      : scoped.teamId
        ? await listTrackedUserIds({ teamId: scoped.teamId })
        : [];

  const people = await buildDayByDay({
    userIds,
    from: period.from,
    to: period.to,
  });

  return <DayByDayTable people={people} />;
}

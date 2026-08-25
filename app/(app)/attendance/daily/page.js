import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { format } from 'date-fns';
import { AttendanceGrid } from '../../../../components/attendance/AttendanceGrid.jsx';
import { DailyAttendanceFilters } from '../../../../components/attendance/DailyAttendanceFilters.jsx';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../../constants/index.js';
import {
  getTeamPolicy,
  listTeams,
  listTrackedUserIds,
  loadAttendanceGrid,
} from '../../../../database.js';
import { recalculateDays } from '../../../../engine/recalculate.js';
import { getSessionUser } from '../../../../session.js';

/**
 * `S-10`. Enter and correct attendance for one team on one date.
 *
 * Server component: it reads the session and the data and hands both down as
 * props (CLAUDE.md — the client leaf never reads the session).
 *
 * Opening this is what `D-15` calls a touch: every tracked member of this team
 * gets a record for this date, ABSENT included, in one bounded call. No other
 * path in the system backfills, and nothing proactive exists — which is why
 * the page gates on `attendance.write` rather than on the read permission.
 * The detailed report anyone may read is the popup on the summary.
 */
export default async function DailyAttendancePage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const teams = await listTeams({ includeDeleted: false, pageSize: 200 });
  const teamId =
    params?.teamId ?? viewer?.teamId ?? teams.items[0]?._id ?? null;
  const date = params?.date ?? format(new Date(), 'yyyy-MM-dd');

  const canWrite = Boolean(viewer?.permissions[PERMISSIONS.ATTENDANCE_WRITE]);

  const header = (
    <PageHeader
      title='Daily attendance'
      description='Enter and correct attendance for one team on one date. Untracked colleagues do not appear here — they receive no day records at all. For a whole period read day by day, use the detailed report on the attendance summary.'
    />
  );

  if (!teamId) {
    return (
      <Stack spacing={3}>
        {header}
        <Alert severity='info'>
          No team exists yet. A day cannot be classified without one: a team
          carries the shifts, calendar and weekly-off pattern every record
          resolves through.
        </Alert>
      </Stack>
    );
  }

  if (canWrite) {
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
  }

  const [{ rows, untrackedCount }, policy] = await Promise.all([
    loadAttendanceGrid(String(teamId), date),
    getTeamPolicy(String(teamId)),
  ]);

  return (
    <Stack spacing={3}>
      {header}

      <DailyAttendanceFilters
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        teamId={String(teamId)}
        date={date}
      />

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
        canWrite={canWrite}
        leaveTypes={policy?.leaveTypes ?? []}
        untrackedCount={untrackedCount}
      />
    </Stack>
  );
}

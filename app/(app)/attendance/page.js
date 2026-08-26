import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { rosterFiltersFor } from '../../../authz/rosterScope.js';
import { AttendanceSummary } from '../../../components/attendance/AttendanceSummary.jsx';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import { listTeams, listUsers } from '../../../database.js';
import { buildAttendanceSummary } from '../../../engine/reports.js';
import { getSessionUser } from '../../../session.js';
import { periodFromSearchParams } from '../../../utils/period.js';

/**
 * Page 1 — Summary. The merge of what used to be three screens: the attendance
 * overview (`S-09`), the leave balances (`S-13`) and the report builder
 * (`S-20`). The daily grid that used to sit beside it is gone: a day is
 * corrected on the day detail (`S-12`), one colleague at a time.
 *
 * Server component: it reads the session and the data and hands both down as
 * props (CLAUDE.md — the client leaf never reads the session).
 *
 * One screen for every role. The difference between a colleague reading about
 * themselves and an administrator reading about everyone is the SCOPE their
 * `attendance.read` is granted at (`FR-1.2`), not a second screen — which is
 * why the report builder's columns can sit here safely: the rows are already
 * narrowed to what the viewer may see before the query runs.
 */
export default async function AttendanceSummaryPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const period = periodFromSearchParams(params);
  const scoped = rosterFiltersFor(
    viewer.permissions[PERMISSIONS.ATTENDANCE_READ],
    viewer,
    { teamId: params?.teamId, userId: params?.userId },
  );

  const [summary, teams, roster] = await Promise.all([
    buildAttendanceSummary({
      from: period.from,
      to: period.to,
      teamId: scoped.teamId,
      userId: scoped.userId,
    }),
    listTeams({ includeDeleted: false, pageSize: 200 }),
    listUsers({ includeDeleted: true, pageSize: 500 }),
  ]);

  /**
   * One column group per leave type anyone actually has movements under.
   * Reading them off the results rather than off policy keeps the table honest:
   * a type no longer offered still shows the days already taken under it
   * (`FR-6.4` makes the list editable at runtime).
   */
  const leaveTypes = [
    ...new Set(
      summary.rows.flatMap((row) => Object.keys(row.balancesByType ?? {})),
    ),
  ].sort();

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Attendance summary'
        description='One row per colleague: what the engine concluded, what the calendar expected, and what every leave balance stands at. A colleague who has left keeps unchanged figures inside their employment period, marked as no longer active.'
        actions={
          // `href` rather than `component={Link}`: this is a server component,
          // and passing the component through fails the build.
          viewer.permissions[PERMISSIONS.ATTENDANCE_IMPORT] ? (
            <Button
              href='/attendance/import'
              variant='outlined'
              startIcon={<UploadFileOutlined />}
            >
              Import punches
            </Button>
          ) : null
        }
      />

      <AttendanceSummary
        rows={summary.rows.map((row) => ({
          ...row,
          deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        }))}
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        people={roster.items.map((person) => ({
          _id: String(person._id),
          fullName: person.fullName,
        }))}
        leaveTypes={leaveTypes}
        period={period}
        filters={{
          teamId: params?.teamId ?? '',
          userId: params?.userId ?? '',
          groups: params?.groups ?? null,
        }}
        untrackedCount={summary.untrackedCount}
        canExport={Boolean(viewer.permissions[PERMISSIONS.REPORT_BUILD])}
        canFilterPeople={scoped.canFilterPeople}
        viewerId={viewer?.userId ?? null}
      />
    </Stack>
  );
}

import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { AttendanceOverview } from '../../../components/attendance/AttendanceOverview.jsx';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import { listTeams, summariseAttendance } from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-09. Server component: it reads the session and the data and hands both
 * down as props.
 *
 * The totals are computed by the database (`summariseAttendance`), not here —
 * NFR-3 puts a full-company month under two seconds at p95, and pulling every
 * record back to add it up stops meeting that long before the roster does.
 */
export default async function AttendanceOverviewPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const today = new Date();
  const filters = {
    from: params?.from ?? format(startOfMonth(today), 'yyyy-MM-dd'),
    to: params?.to ?? format(endOfMonth(today), 'yyyy-MM-dd'),
    teamId: params?.teamId ?? '',
    userId: params?.userId ?? '',
    includeDeleted: params?.includeDeleted === 'true',
  };

  const [teams, summary] = await Promise.all([
    listTeams({ includeDeleted: false, pageSize: 200 }),
    summariseAttendance({
      from: filters.from,
      to: filters.to,
      teamId: filters.teamId || null,
      userId: filters.userId || null,
      includeDeleted: filters.includeDeleted,
    }),
  ]);

  /**
   * One column per leave type anyone actually took in the range. Reading them
   * off the results rather than off policy keeps the table honest: a type no
   * longer offered still shows the days already taken under it (FR-6.4 makes
   * the list editable at runtime).
   */
  const leaveTypes = [
    ...new Set(summary.rows.flatMap((row) => Object.keys(row.leaveByType))),
  ].sort();

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Attendance'
        description='What the engine concluded for every colleague over a chosen range. A colleague who has left keeps unchanged figures inside their employment period, marked as no longer active.'
        actions={
          // S-11 is routed and gated but was linked from nowhere. `href`
          // rather than `component={Link}`: this is a server component, and
          // passing the component through fails the build.
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

      <AttendanceOverview
        rows={summary.rows.map((row) => ({
          ...row,
          deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        }))}
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        leaveTypes={leaveTypes}
        filters={filters}
        untrackedCount={summary.untrackedCount}
        viewerId={viewer?.userId ?? null}
      />
    </Stack>
  );
}

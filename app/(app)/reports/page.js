import Stack from '@mui/material/Stack';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ReportBuilder } from '../../../components/reports/ReportBuilder.jsx';
import { listTeams, listUsers } from '../../../database.js';
import { buildAttendanceReport } from '../../../engine/reports.js';

/**
 * S-20, `FR-8.3`. Any date range, not only a calendar month.
 *
 * Gated on `report.build` by `proxy.js`, which `EMPLOYEE` does not hold —
 * unlike the `S-09` read surface beside it (`FR-8.1`). The month is only the
 * default the filters open on; the range itself is free.
 */
export default async function ReportsPage({ searchParams }) {
  const params = await searchParams;

  const now = new Date();
  const filters = {
    from: params?.from ?? format(startOfMonth(now), 'yyyy-MM-dd'),
    to: params?.to ?? format(endOfMonth(now), 'yyyy-MM-dd'),
    teamId: params?.teamId ?? '',
    userId: params?.userId ?? '',
  };

  const [report, teams, roster] = await Promise.all([
    buildAttendanceReport({
      from: filters.from,
      to: filters.to,
      teamId: filters.teamId || null,
      userId: filters.userId || null,
    }),
    listTeams({ includeDeleted: false }),
    listUsers({ includeDeleted: true, pageSize: 500 }),
  ]);

  /**
   * FR-6.4 makes the leave types editable at runtime, so the columns come
   * from what the range actually holds rather than from today's policy — a
   * type no longer offered still shows the days already taken under it.
   */
  const leaveTypes = [
    ...new Set(
      report.rows.flatMap((row) => Object.keys(row.leaveByType ?? {})),
    ),
  ].sort();

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Report builder'
        description='An attendance report for any date range, not only a calendar month. Working-day and holiday counts derive from the calendar of the team the user held on each date, not their current team. Untracked users are excluded and the exclusion is stated.'
      />

      <ReportBuilder
        rows={report.rows}
        untrackedCount={report.untrackedCount}
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        people={roster.items.map((person) => ({
          _id: String(person._id),
          fullName: person.fullName,
        }))}
        leaveTypes={leaveTypes}
        filters={filters}
      />
    </Stack>
  );
}

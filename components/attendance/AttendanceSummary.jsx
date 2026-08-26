'use client';

import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import TableViewOutlined from '@mui/icons-material/TableViewOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PERIOD_MODE, SCOPES } from '../../constants/index.js';
import { periodQuery } from '../../utils/period.js';
import { plural } from '../../utils/plural.js';
import {
  collapsedFromParam,
  collapsedToParam,
  flattenSummaryRow,
  summaryColumnGroups,
  visibleColumns,
} from '../../utils/summaryColumns.js';
import { EmptyState } from '../EmptyState.jsx';
import { DetailedReportDialog } from './DetailedReportDialog.jsx';
import { PeriodFilter } from './PeriodFilter.jsx';

/**
 * Page 1. One row per colleague, merging what used to be three screens: the
 * attendance overview, the leave balances and the report builder.
 *
 * They were never independent. A reader comparing absences against a leave
 * balance had two tabs open and had to trust that both were filtered the same
 * way; the merge removes the question by removing the second tab.
 *
 * That costs thirty-two columns, so the header is two tiers and every group
 * but the identifying one collapses to a single headline figure. The frozen
 * name and code are what make sideways scrolling readable — without them a
 * reader four columns to the right no longer knows whose row they are on.
 */
export function AttendanceSummary({
  rows,
  teams,
  people,
  leaveTypes,
  period,
  filters,
  view = SCOPES.ALL,
  includeLeft = false,
  isAdmin = false,
  untrackedCount = 0,
  canExport = false,
  canFilterPeople = true,
  viewerId = null,
}) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const groups = summaryColumnGroups(leaveTypes);
  const collapsed = collapsedFromParam(filters.groups ?? null, groups);
  const columns = visibleColumns(groups, collapsed);
  const flatRows = rows.map((row) => flattenSummaryRow(row, leaveTypes));

  const showingSelf = view === SCOPES.SELF;

  const go = (next) => {
    const merged = {
      ...periodQuery(period),
      teamId: filters.teamId,
      userId: filters.userId,
      groups: filters.groups,
      // Always spelled out. Left to the absence of a colleague filter, a
      // reader switching away from their own row would send nothing and the
      // page default would put them straight back on it.
      view,
      includeLeft: includeLeft ? 'true' : '',
      ...next,
    };

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, String(value));
    }

    router.push(`/attendance?${query}`);
  };

  const toggleGroup = (groupId) => {
    const next = new Set(collapsed);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    go({ groups: collapsedToParam(next) });
  };

  /**
   * `P-43`. The rows on screen go up with the request rather than being
   * re-queried, so the file is exactly the report the sender was looking at.
   *
   * Every column travels, whatever is collapsed: a collapsed group is a
   * reading convenience, and a spreadsheet missing the figures behind it would
   * be a different report from the one the sender thought they were sending.
   */
  const exportAs = async (format) => {
    setExporting(true);
    try {
      const filename = `pulse-attendance-${period.from}-to-${period.to}`;
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          columns: visibleColumns(groups, new Set()),
          rows: flatRows,
          filename,
        }),
      });

      if (!response.ok) return;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack spacing={2}>
          <PeriodFilter
            period={period}
            onChange={(next) =>
              // The period keys are cleared before the new ones are applied, so
              // switching from a custom range to a week cannot leave a stale
              // from/to behind for the next link to pick up.
              go({ mode: '', anchor: '', from: '', to: '', ...next })
            }
          />

          {canFilterPeople ? (
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              sx={{ alignItems: { md: 'center' } }}
            >
              {/* An administrator arrives to read about everybody and a
                  colleague arrives to read about themselves, so each opens on
                  their own answer. Neither is locked to it: `FR-8.1` gives
                  every colleague attendance company-wide, as the old workbook
                  did, and this only decides where they land. */}
              <ToggleButtonGroup
                exclusive
                value={view}
                onChange={(_event, next) => {
                  if (next) go({ view: next, teamId: '', userId: '' });
                }}
                aria-label='Whose attendance to show'
              >
                <ToggleButton value={SCOPES.SELF}>Just me</ToggleButton>
                <ToggleButton value={SCOPES.ALL}>Everyone</ToggleButton>
              </ToggleButtonGroup>

              {/* Not offered under "Just me": a team or a colleague chosen
                  there is a filter that cannot apply, and a stale one left in
                  the URL would read as though it had. */}
              {showingSelf ? null : (
                <>
                  <TextField
                    select
                    label='Team'
                    value={filters.teamId ?? ''}
                    onChange={(event) => go({ teamId: event.target.value })}
                    slotProps={{
                      select: { displayEmpty: true },
                      inputLabel: { shrink: true },
                    }}
                    sx={{ minWidth: 200 }}
                  >
                    <MenuItem value=''>Every team</MenuItem>
                    {teams.map((team) => (
                      <MenuItem key={team._id} value={team._id}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label='Colleague'
                    value={filters.userId ?? ''}
                    onChange={(event) => go({ userId: event.target.value })}
                    slotProps={{
                      select: { displayEmpty: true },
                      inputLabel: { shrink: true },
                    }}
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value=''>Everyone</MenuItem>
                    {people.map((person) => (
                      <MenuItem key={person._id} value={person._id}>
                        {person.fullName}
                      </MenuItem>
                    ))}
                  </TextField>
                </>
              )}

              {/* `FR-2.4` keeps a departed colleague's figures unchanged and
                  marked, so they can always be read back. Off by default,
                  because most days the question is about the people currently
                  working — and offered only to an administrator, because
                  deciding to read a former colleague's record is one. */}
              {isAdmin ? (
                <FormControlLabel
                  label='Include colleagues who have left'
                  control={
                    <Checkbox
                      checked={includeLeft}
                      onChange={(event) =>
                        go({ includeLeft: event.target.checked ? 'true' : '' })
                      }
                    />
                  }
                />
              ) : null}

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ ml: { md: 'auto' } }}
              >
                {/* Reading the detail is attendance.read, which anyone on this
                    screen already holds. Producing a FILE of it is the
                    restricted act, which is why the two downloads beside this
                    are gated and this is not (FR-8.1). */}
                <Button
                  type='button'
                  variant='contained'
                  startIcon={<TableViewOutlined />}
                  disabled={rows.length === 0}
                  onClick={() => setDetailOpen(true)}
                >
                  View Detailed Report
                </Button>

                {canExport ? (
                  <Button
                    type='button'
                    variant='outlined'
                    startIcon={<DownloadOutlined />}
                    disabled={exporting || rows.length === 0}
                    onClick={() => exportAs('xlsx')}
                  >
                    Download report in Excel
                  </Button>
                ) : null}

                {canExport ? (
                  <Button
                    type='button'
                    variant='outlined'
                    startIcon={<DownloadOutlined />}
                    disabled={exporting || rows.length === 0}
                    onClick={() => exportAs('csv')}
                  >
                    Download report in CSV
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      {untrackedCount > 0 ? (
        <Alert severity='info'>
          {untrackedCount} untracked{' '}
          {untrackedCount === 1 ? 'colleague is' : 'colleagues are'} excluded
          from every total below. Untracked colleagues receive no day records at
          all, so there is nothing to count for them.
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title='Nothing recorded in this period'
          description='No colleague this filter reaches has a record between these dates. A date nothing has touched carries no record at all, so this is silence rather than absence.'
        />
      ) : (
        <Paper variant='outlined'>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  {groups.map((group) => (
                    <GroupHeader
                      key={group.id}
                      group={group}
                      collapsed={collapsed.has(group.id)}
                      onToggle={() => toggleGroup(group.id)}
                    />
                  ))}
                </TableRow>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      align={column.numeric ? 'right' : 'left'}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {rows.map((row, rowIndex) => (
                  <TableRow key={row.userId} hover>
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        align={column.numeric ? 'right' : 'left'}
                      >
                        <SummaryCell
                          column={column}
                          row={row}
                          value={flatRows[rowIndex][column.key]}
                          period={period}
                          linkProfile={isAdmin || row.userId === viewerId}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <DetailedReportDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        period={period}
        filters={filters}
      />

      <Typography variant='caption' color='text.secondary'>
        Expected hours are the shift held on each working day, with approved
        leave already netted off — the leave that was netted off is the column
        beside it. Working days and holidays come from the calendar of the team
        each colleague held on each date, not their current team.{' '}
        {plural(leaveTypes.length, 'leave type')} appear as columns because the
        period holds movements under them.
      </Typography>
    </Stack>
  );
}

/**
 * The top tier: a group's name and its chevron.
 *
 * A collapsed group still occupies its headline column, so the two tiers stay
 * in step — a header spanning more or fewer cells than the body beneath it is
 * the drift `columnPriority.js` exists to prevent.
 */
function GroupHeader({ group, collapsed, onToggle }) {
  const span = collapsed ? 1 : group.columns.length;

  if (!group.collapsible) {
    return (
      <TableCell colSpan={span}>
        <Typography variant='metricLabel'>{group.label}</Typography>
      </TableCell>
    );
  }

  return (
    <TableCell colSpan={span}>
      <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
        <Tooltip
          title={
            collapsed
              ? `Show every ${group.label} column`
              : `Collapse ${group.label} to one column`
          }
        >
          <IconButton
            size='small'
            onClick={onToggle}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <KeyboardArrowRight fontSize='small' />
            ) : (
              <KeyboardArrowDown fontSize='small' />
            )}
          </IconButton>
        </Tooltip>
        <Typography variant='metricLabel'>{group.label}</Typography>
      </Stack>
    </TableCell>
  );
}

/** One cell. The identifying columns carry links; everything else is a figure. */
function SummaryCell({ column, row, value, period, linkProfile = false }) {
  if (column.key === 'fullName') {
    return (
      <Stack spacing={0.25}>
        {/* A colleague reaches nobody's profile but their own — `proxy.js`
            answers 404 for anybody else's. A link that always 404s is worse
            than no link, so the name is simply a name for them. */}
        {linkProfile ? (
          <Link href={`/users/${row.userId}`}>{row.fullName}</Link>
        ) : (
          <Typography variant='body2'>{row.fullName}</Typography>
        )}
        {row.noLongerActive ? (
          <Chip variant='statusNeutral' label='No longer active' />
        ) : null}
      </Stack>
    );
  }

  if (column.key === 'employeeCode') {
    return (
      <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
        <Typography variant='mono'>{value}</Typography>
        <Tooltip title='Their year, month by month'>
          <IconButton
            size='small'
            component={Link}
            href={`/attendance/annual?userId=${row.userId}&year=${period.from.slice(0, 4)}`}
            aria-label={`Open ${row.fullName}'s year`}
          >
            <CalendarMonthOutlined fontSize='small' />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }

  /**
   * `BR-16` caps work-from-home per MONTH, so the ceiling is only shown beside
   * the count when the period IS a month. A week's usage against a monthly
   * quota reads as a ratio and is not one; over a custom range spanning two
   * months it is not one either. In both cases the count stands alone and the
   * quota is stated in words on hover, which cannot be misread as a fraction.
   */
  if (column.key === 'wfh') {
    if (row.wfhQuota === null || row.wfhQuota === undefined) {
      return <Typography variant='mono'>{value}</Typography>;
    }

    const perMonth = `${row.wfhQuota} work-from-home days a month`;

    if (period.mode !== PERIOD_MODE.MONTHLY) {
      return (
        <Typography variant='mono' title={perMonth}>
          {value}
        </Typography>
      );
    }

    return (
      <Typography variant='mono' title={perMonth}>
        {value} of {row.wfhQuota}
      </Typography>
    );
  }

  // A balance links to the movements that produced it: NFR-11 is answerable
  // only if "why is this number what it is" is one click from the number.
  if (column.key.startsWith('leave:')) {
    const [, leaveType] = column.key.split(':');
    return (
      <Link href={`/leave/${row.userId}/ledger?leaveType=${leaveType}`}>
        <Typography variant='mono'>{value}</Typography>
      </Link>
    );
  }

  return <Typography variant='mono'>{value}</Typography>;
}

/**
 * Nothing is frozen, deliberately.
 *
 * Name and code were pinned so a reader scrolled far right still knew whose
 * row they were on. On a phone that reasoning inverts: two pinned columns eat
 * most of the viewport, leaving a sliver for the figures the reader came for,
 * and the pinned cells need an opaque background of their own — which is what
 * made those two headers a different colour from the rest of the row.
 *
 * They are ordinary columns now. The reader keeps their place by collapsing a
 * group instead, which costs one click and no width at all.
 */

'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { plural } from '../../utils/plural.js';
import { EmptyState } from '../EmptyState.jsx';

/**
 * `S-20`, `FR-8.3`. The columns the office administration team relies on
 * today, over **any** date range rather than only a calendar month.
 *
 * Working days and holidays come from the calendar of the team each colleague
 * held **on each date** (`FR-3.9`), which is why they sit beside the totals
 * rather than being inferred from them: 21 present out of 22 working days is
 * a sentence, and 21 on its own is not.
 */
const BASE_COLUMNS = [
  { key: 'fullName', label: 'Employee' },
  { key: 'employeeCode', label: 'Code' },
  { key: 'workingDays', label: 'Working days' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'wfh', label: 'WFH' },
  { key: 'lateDays', label: 'Late' },
  { key: 'shortDays', label: 'Short days' },
  { key: 'holidayWork', label: 'Holiday work' },
  { key: 'pto', label: 'PTO' },
];

export function ReportBuilder({
  rows,
  teams,
  people,
  leaveTypes,
  untrackedCount,
  filters,
}) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  // FR-6.4 makes the leave types editable at runtime, so the columns come from
  // what the range actually holds rather than from today's policy.
  const columns = [
    ...BASE_COLUMNS,
    ...leaveTypes.map((type) => ({ key: `leave:${type}`, label: type })),
  ];

  /** One flat row per colleague, in exactly the shape the export writes. */
  const flatten = (row) => ({
    ...row,
    ...Object.fromEntries(
      leaveTypes.map((type) => [`leave:${type}`, row.leaveByType?.[type] ?? 0]),
    ),
  });

  const go = (next) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...next })) {
      if (value) query.set(key, String(value));
    }
    router.push(`/reports?${query}`);
  };

  /**
   * `P-43`. The rows on screen go up with the request rather than being
   * re-queried, so the file is exactly the report the sender was looking at.
   */
  const exportAs = async (format) => {
    setExporting(true);
    try {
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          columns,
          rows: rows.map(flatten),
          filename: `pulse-attendance-${filters.from}-to-${filters.to}`,
        }),
      });

      if (!response.ok) return;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pulse-attendance-${filters.from}-to-${filters.to}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            label='From'
            type='date'
            value={filters.from}
            onChange={(event) => go({ from: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label='To'
            type='date'
            value={filters.to}
            onChange={(event) => go({ to: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label='Team'
            value={filters.teamId ?? ''}
            onChange={(event) => go({ teamId: event.target.value })}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
            sx={{ minWidth: 180 }}
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
            label='Employee'
            value={filters.userId ?? ''}
            onChange={(event) => go({ userId: event.target.value })}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value=''>Everyone</MenuItem>
            {people.map((person) => (
              <MenuItem key={person._id} value={person._id}>
                {person.fullName}
              </MenuItem>
            ))}
          </TextField>

          <Button
            type='button'
            variant='outlined'
            disabled={exporting || rows.length === 0}
            onClick={() => exportAs('csv')}
          >
            Export CSV
          </Button>
          <Button
            type='button'
            variant='outlined'
            disabled={exporting || rows.length === 0}
            onClick={() => exportAs('xlsx')}
          >
            Export Excel
          </Button>
        </Stack>
      </Paper>

      {/* FR-2.10 and DC-6: stated, never silent. */}
      {untrackedCount > 0 ? (
        <Alert severity='info'>
          {plural(untrackedCount, 'untracked colleague')} excluded. An untracked
          colleague receives no day records, so there is nothing to report on
          them.
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title='Nobody to report on'
          description='No tracked colleague matches these filters over this range. A date range outside every employment period produces no rows, which is not the same as everybody being absent.'
        />
      ) : (
        <Paper variant='outlined'>
          <Stack sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column.key}>{column.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {rows.map((row) => {
                  const flat = flatten(row);

                  return (
                    <TableRow key={row.userId}>
                      {columns.map((column) =>
                        column.key === 'fullName' ? (
                          <TableCell key={column.key}>
                            <Stack spacing={0.25}>
                              <Typography variant='bodyStrong'>
                                {row.fullName}
                              </Typography>
                              {/* FR-2.4: marked, and the totals stand. */}
                              {row.noLongerActive ? (
                                <Chip
                                  variant='statusNeutral'
                                  label='No longer active'
                                />
                              ) : null}
                            </Stack>
                          </TableCell>
                        ) : (
                          <TableCell key={column.key}>
                            <Typography variant='mono'>
                              {flat[column.key] ?? 0}
                            </Typography>
                          </TableCell>
                        ),
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

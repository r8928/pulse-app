'use client';

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
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * `S-21`, `FR-8.4`. One colleague's year, aggregating every month.
 *
 * **Every month is here.** A month with no data is an explicit zero row and
 * is never silently omitted — that omission is workbook defect `F1` and the
 * reason this screen exists in this shape (MVP criterion 9). A reader
 * scanning twelve rows can see a gap; a reader scanning nine rows cannot see
 * the three that are not there.
 *
 * A month outside the employment period is marked as such rather than shown
 * as absence. They are different claims, and the workbook conflated them.
 */
const COLUMNS = [
  { key: 'workingDays', label: 'Working days' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'wfh', label: 'WFH' },
  { key: 'leave', label: 'Leave' },
  { key: 'lateDays', label: 'Late' },
  { key: 'shortDays', label: 'Short days' },
  { key: 'holidayWork', label: 'Holiday work' },
];

export function AnnualSummary({ summary, people, filters }) {
  const router = useRouter();

  const go = (next) => {
    const query = new URLSearchParams({ ...filters, ...next });
    router.push(`/reports/annual?${query}`);
  };

  const years = [];
  for (
    let year = Number(filters.year) + 1;
    year > Number(filters.year) - 5;
    year--
  ) {
    years.push(year);
  }

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            select
            label='Employee'
            value={filters.userId ?? ''}
            onChange={(event) => go({ userId: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 220 }}
          >
            {people.map((person) => (
              <MenuItem key={person._id} value={person._id}>
                {person.fullName}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label='Year'
            value={String(filters.year)}
            onChange={(event) => go({ year: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 140 }}
          >
            {years.map((year) => (
              <MenuItem key={year} value={String(year)}>
                {year}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      {summary ? (
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'baseline' } }}
          >
            <Typography variant='sectionTitle'>
              {summary.user.fullName} · {summary.year}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {summary.user.employeeCode} · PTO balance {summary.pto}
            </Typography>
            <Typography variant='body2'>
              <Link href={`/leave/${summary.user._id}/ledger`}>
                What produced these
              </Link>
            </Typography>
          </Stack>

          <Paper variant='outlined'>
            <Stack sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Month</TableCell>
                    {COLUMNS.map((column) => (
                      <TableCell key={column.key}>{column.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {summary.months.map((month) => (
                    <TableRow key={month.month}>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Typography variant='bodyStrong'>
                            {month.label}
                          </Typography>
                          {/* Not employed is not the same as absent, and the
                              workbook conflating the two is defect F1. */}
                          {month.inEmploymentPeriod ? null : (
                            <Chip
                              variant='statusNeutral'
                              label='Not employed this month'
                            />
                          )}
                        </Stack>
                      </TableCell>

                      {COLUMNS.map((column) => (
                        <TableCell key={column.key}>
                          <Typography variant='mono'>
                            {month[column.key]}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          </Paper>
        </Stack>
      ) : null}
    </Stack>
  );
}

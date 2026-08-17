'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '../EmptyState.jsx';

/**
 * S-09. What the engine concluded, totalled over a range.
 *
 * `attendance.read` is seeded at ALL for every role (FR-8.1), so this is the
 * screen a colleague reads about themselves as well as the one an
 * administrator reads about everyone. Narrowing that permission to SELF on
 * S-19 turns it into a personal view with no code change (MVP criterion 4) —
 * which is why the "just me" filter is an ordinary filter rather than a
 * separate screen.
 */
export function AttendanceOverview({
  rows,
  teams,
  leaveTypes,
  filters,
  untrackedCount = 0,
  viewerId = null,
}) {
  const router = useRouter();

  const go = (next) => {
    const merged = { ...filters, ...next };
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(merged)) {
      if (value !== '' && value !== false && value !== null) {
        query.set(key, String(value));
      }
    }

    router.push(`/attendance?${query.toString()}`);
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
            sx={{ minWidth: 200 }}
          >
            <MenuItem value=''>Every team</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team._id} value={team._id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>

          {viewerId ? (
            <Button
              type='button'
              variant={filters.userId === viewerId ? 'contained' : 'outlined'}
              onClick={() =>
                go({ userId: filters.userId === viewerId ? '' : viewerId })
              }
            >
              Just me
            </Button>
          ) : null}

          <FormControlLabel
            control={
              <Switch
                checked={Boolean(filters.includeDeleted)}
                onChange={(event) =>
                  go({ includeDeleted: event.target.checked })
                }
              />
            }
            label='Include colleagues who have left'
          />
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

      <Alert severity='info'>
        PTO balances arrive with the balances screen, which replays them from
        the ledger. A figure here before then would be a guess.
      </Alert>

      {rows.length === 0 ? (
        <EmptyState
          title='No attendance in this range'
          description='Nothing has been recorded between these dates for the colleagues this filter reaches. A date nothing has touched carries no record at all.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Present</TableCell>
                <TableCell>Absent</TableCell>
                {leaveTypes.map((type) => (
                  <TableCell key={type}>{type}</TableCell>
                ))}
                <TableCell>WFH used</TableCell>
                <TableCell>Late days</TableCell>
                <TableCell>Short days</TableCell>
                <TableCell>Holiday work</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Link href={`/users/${row.userId}`}>{row.fullName}</Link>
                      <Typography variant='caption' color='text.secondary'>
                        {row.employeeCode}
                      </Typography>
                      {row.deletedAt ? (
                        <Chip
                          variant='statusNeutral'
                          label='No longer active'
                        />
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{row.present}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{row.absent}</Typography>
                  </TableCell>
                  {leaveTypes.map((type) => (
                    <TableCell key={type}>
                      <Typography variant='mono'>
                        {row.leaveByType[type] ?? 0}
                      </Typography>
                    </TableCell>
                  ))}
                  <TableCell>
                    <Typography variant='mono'>{row.wfh}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{row.lateDays}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{row.shortDays}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{row.holidayWork}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

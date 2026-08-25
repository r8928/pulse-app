'use client';

import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { DAY_TYPE } from '../../constants/index.js';
import { hideBelow } from '../../utils/columnPriority.js';
import { formatClock, formatDuration } from '../../utils/duration.js';
import { EmptyState } from '../EmptyState.jsx';

/**
 * Page 2's day-by-day view, in the shape of the workbook it replaces: one
 * block per colleague, one row per date, the name spanning their block the way
 * a merged cell does.
 *
 * Every date in the range is present, worked or not. A view assembled only
 * from the records that exist cannot show a gap, and a gap — the Tuesday
 * nobody punched, the week nobody opened the grid on — is the thing a reader
 * came here to find.
 */
export function DayByDayTable({ people }) {
  if (people.length === 0) {
    return (
      <EmptyState
        title='Nobody selected'
        description='Choose a team, or pick the colleagues you want to compare. The view shows every date in the period for each of them, including the dates nothing was recorded on.'
      />
    );
  }

  return (
    <Paper variant='outlined'>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell>Day, date</TableCell>
              <TableCell>Check-in</TableCell>
              <TableCell>Check-out</TableCell>
              <TableCell align='right'>Total hours</TableCell>
              <TableCell align='right' sx={hideBelow('md')}>
                Leave balance
              </TableCell>
              <TableCell align='right' sx={hideBelow('md')}>
                Leave used
              </TableCell>
              <TableCell align='right' sx={hideBelow('lg')}>
                Leave awarded
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {people.flatMap((person) =>
              person.days.map((day, index) => (
                <DayRow
                  key={`${person.userId}|${day.date}`}
                  person={person}
                  day={day}
                  // The name is written once and spans the block, as the
                  // workbook merges it — repeating it on every row of a month
                  // is thirty repetitions of the thing that never changes.
                  showPerson={index === 0}
                  blockLength={person.days.length}
                />
              )),
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function DayRow({ person, day, showPerson, blockLength }) {
  const offDay = day.dayType && day.dayType !== DAY_TYPE.WORKING;

  return (
    <TableRow hover>
      {showPerson ? (
        <TableCell rowSpan={blockLength} sx={{ verticalAlign: 'top' }}>
          <Stack spacing={0.25}>
            <Link href={`/users/${person.userId}`}>{person.fullName}</Link>
            <Typography variant='mono' color='text.secondary'>
              {person.employeeCode}
            </Typography>
            {person.noLongerActive ? (
              <Chip variant='statusNeutral' label='No longer active' />
            ) : null}
          </Stack>
        </TableCell>
      ) : null}

      <TableCell sx={offDay ? { color: 'text.secondary' } : undefined}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant='body2'>
            {format(parseISO(day.date), 'EEE, d MMM')}
          </Typography>
          {/* FR-2.12: outside the employment period is a different thing from
              absence, and saying so is the whole of workbook defect F1. */}
          {day.inEmploymentPeriod ? null : (
            <Chip variant='statusNeutral' label='Not employed' />
          )}
        </Stack>
      </TableCell>

      <TableCell>
        <Clock instant={day.checkIn} timezone={day.timezone} />
      </TableCell>
      <TableCell>
        <Clock instant={day.checkOut} timezone={day.timezone} />
      </TableCell>

      <TableCell align='right'>
        <Typography variant='mono'>
          {day.workedMinutes ? formatDuration(day.workedMinutes) : '—'}
        </Typography>
      </TableCell>

      <TableCell align='right' sx={hideBelow('md')}>
        <Link href={`/leave/${person.userId}/ledger`}>
          <Typography variant='mono'>{day.leaveBalance}</Typography>
        </Link>
      </TableCell>
      <TableCell align='right' sx={hideBelow('md')}>
        <Typography variant='mono'>{day.leaveUsed || '—'}</Typography>
      </TableCell>
      <TableCell align='right' sx={hideBelow('lg')}>
        <Typography variant='mono'>{day.leaveAwarded || '—'}</Typography>
      </TableCell>
    </TableRow>
  );
}

/**
 * §7.2: an instant is stored in UTC and read in the timezone of the shift it
 * belongs to. A day with no record names no shift, so it has no timezone to
 * read in — and a punch on such a day cannot exist, since the work date the
 * engine assigns is what creates the record.
 */
function Clock({ instant, timezone }) {
  if (!instant || !timezone) {
    return (
      <Typography variant='mono' color='text.secondary'>
        —
      </Typography>
    );
  }

  const at = parseISO(instant);

  return (
    <Typography
      variant='mono'
      title={`${format(at, 'EEE d MMM yyyy')} — ${formatClock(at, timezone)} (${timezone})`}
    >
      {formatClock(at, timezone)}
    </Typography>
  );
}

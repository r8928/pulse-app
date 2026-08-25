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
import { DAY_TYPE } from '../../constants/index.js';
import { formatClock, formatDuration } from '../../utils/duration.js';

/**
 * The detailed report as a sheet, in the shape of the workbook it replaces:
 * one block per colleague, one row per date, the name written once against
 * their block the way a merged cell does.
 *
 * Gridlines on every cell, a filled header row, and banded rows — the visual
 * grammar of a spreadsheet, because that is what the people reading this have
 * read for years and recognising the format is most of reading it.
 *
 * On a phone the columns cannot all fit at a legible size, so the sheet keeps
 * its shape and scrolls sideways inside its own box rather than reflowing into
 * something that no longer looks like the sheet it is. The date column is
 * pinned for that scroll and only that scroll: a reader four columns right
 * still has to know which day they are on, and unlike the summary table there
 * is only one pinned column here, so a phone keeps most of its width.
 */
const COLUMNS = [
  { key: 'date', label: 'Day, date' },
  { key: 'checkIn', label: 'Check-in' },
  { key: 'checkOut', label: 'Check-out' },
  { key: 'hours', label: 'Total hours', numeric: true },
  { key: 'leaveBalance', label: 'Leave balance', numeric: true },
  { key: 'leaveUsed', label: 'Leave used', numeric: true },
  { key: 'leaveAwarded', label: 'Leave awarded', numeric: true },
];

/** A spreadsheet's ruled grid, applied to every cell of the sheet. */
const ruled = {
  border: 1,
  borderColor: 'divider',
  whiteSpace: 'nowrap',
};

const headerCell = {
  ...ruled,
  backgroundColor: 'action.hover',
  position: 'sticky',
  top: 0,
  zIndex: 3,
};

export function DetailedReportSheet({ people }) {
  return (
    <Stack spacing={3}>
      {people.map((person) => (
        <PersonBlock key={person.userId} person={person} />
      ))}
    </Stack>
  );
}

function PersonBlock({ person }) {
  const worked = person.days.reduce(
    (total, day) => total + (day.workedMinutes ?? 0),
    0,
  );

  return (
    <Paper variant='outlined'>
      {/* The name is a heading over the block rather than a merged cell down
          its left edge. A merged cell spanning thirty rows is unreadable on a
          phone and unreachable to a screen reader; a heading says the same
          thing once, in the place a reader looks first. */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{
          p: 2,
          alignItems: { sm: 'baseline' },
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Stack direction='row' spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography variant='bodyStrong'>{person.fullName}</Typography>
          <Typography variant='mono' color='text.secondary'>
            {person.employeeCode}
          </Typography>
          {person.noLongerActive ? (
            <Chip variant='statusNeutral' label='No longer active' />
          ) : null}
        </Stack>

        <Typography variant='caption' color='text.secondary'>
          {formatDuration(worked)} across {person.days.length} dates
        </Typography>
      </Stack>

      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size='small' sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              {COLUMNS.map((column, index) => (
                <TableCell
                  key={column.key}
                  align={column.numeric ? 'right' : 'left'}
                  sx={
                    index === 0 ? { ...headerCell, ...pinnedDate } : headerCell
                  }
                >
                  <Typography variant='metricLabel'>{column.label}</Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {person.days.map((day, index) => (
              <DayRow key={day.date} day={day} banded={index % 2 === 1} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

/** Only the date is pinned — one column a phone can afford to give up. */
const pinnedDate = {
  position: 'sticky',
  left: 0,
  zIndex: 2,
  backgroundColor: 'background.paper',
};

function DayRow({ day, banded }) {
  const offDay = day.dayType && day.dayType !== DAY_TYPE.WORKING;

  // Banding is the spreadsheet's own reading aid; a non-working day is tinted
  // more strongly still, so a weekend reads as a weekend and not as absence.
  const rowTint = offDay
    ? { backgroundColor: 'action.selected' }
    : banded
      ? { backgroundColor: 'action.hover' }
      : undefined;

  return (
    <TableRow sx={rowTint}>
      <TableCell sx={{ ...ruled, ...pinnedDate, ...rowTint }}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant='body2'>
            {format(parseISO(day.date), 'EEE, d MMM')}
          </Typography>
          {day.inEmploymentPeriod ? null : (
            <Chip variant='statusNeutral' label='Not employed' />
          )}
        </Stack>
      </TableCell>

      <TableCell sx={ruled}>
        <Clock instant={day.checkIn} timezone={day.timezone} />
      </TableCell>
      <TableCell sx={ruled}>
        <Clock instant={day.checkOut} timezone={day.timezone} />
      </TableCell>

      <TableCell align='right' sx={ruled}>
        <Typography variant='mono'>
          {day.workedMinutes ? formatDuration(day.workedMinutes) : '—'}
        </Typography>
      </TableCell>
      <TableCell align='right' sx={ruled}>
        <Typography variant='mono'>{day.leaveBalance}</Typography>
      </TableCell>
      <TableCell align='right' sx={ruled}>
        <Typography variant='mono'>{day.leaveUsed || '—'}</Typography>
      </TableCell>
      <TableCell align='right' sx={ruled}>
        <Typography variant='mono'>{day.leaveAwarded || '—'}</Typography>
      </TableCell>
    </TableRow>
  );
}

/**
 * §7.2: an instant is stored in UTC and read in the timezone of the shift it
 * belongs to. A date with no record names no shift and so has no zone to read
 * in — and no punch can exist on it, since the work date the engine assigns is
 * what creates the record in the first place.
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

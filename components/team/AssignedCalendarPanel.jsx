'use client';

import CelebrationOutlined from '@mui/icons-material/CelebrationOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { HOLIDAY_TYPE } from '../../constants/index.js';
import { EmptyState } from '../EmptyState.jsx';

const CALENDARS_HREF = '/settings/holiday-calendars';

/**
 * The written label for each type. `FR-3.7` is explicit that a calendar shall
 * never depend on formatting or colour, so the type is always spelled out and
 * carries an icon — the chip tint is the third signal, never the only one.
 */
const TYPE_LABEL = {
  [HOLIDAY_TYPE.PUBLIC]: 'Public holiday',
  [HOLIDAY_TYPE.COMPANY]: 'Company holiday',
};

const TYPE_ICON = {
  [HOLIDAY_TYPE.PUBLIC]: EventOutlined,
  [HOLIDAY_TYPE.COMPANY]: CelebrationOutlined,
};

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * The calendar this team is assigned to, read only.
 *
 * Editing happens on `S-26` and nowhere else. A calendar is shared with other
 * teams (`FR-3.7`), so an edit reached from one team's screen would change
 * other teams' working weeks behind a click that looked local — which is why
 * this panel offers no control at all, only the link to where the change
 * belongs.
 */
export function AssignedCalendarPanel({
  calendar,
  holidays,
  weeklyOffPattern,
}) {
  if (!calendar) {
    return (
      <EmptyState
        title='This team is assigned to no calendar'
        description='No date is a holiday and none is a weekly off until one is assigned — not even Saturday and Sunday, which is not assumed. Assign one on the holiday calendars screen.'
        action={<Link href={CALENDARS_HREF}>Holiday calendars</Link>}
      />
    );
  }

  const days = weeklyOffPattern?.daysOfWeek ?? null;

  return (
    <Stack spacing={2}>
      <Typography variant='body2' color='text.secondary'>
        This team observes <Link href={CALENDARS_HREF}>{calendar.name}</Link>.
        It is shared with every other team assigned to it, so it is edited on
        the holiday calendars screen rather than here — a change made from one
        team's page would alter another team's working week.
      </Typography>

      {days === null ? (
        <Alert severity='warning'>
          {calendar.name} has no weekly off pattern, so no date is classified as
          a weekly off for this team. Nothing is assumed — not even Saturday and
          Sunday — so this stays outstanding until somebody sets it.
        </Alert>
      ) : (
        <Alert severity='info'>
          Non-working days:{' '}
          {days.length === 0
            ? 'none — the teams on this calendar work every day, which is a decision rather than an unset value'
            : days.map((day) => DAY_NAMES[day]).join(', ')}
          .
        </Alert>
      )}

      {holidays.length === 0 ? (
        <EmptyState
          title='No holiday on this calendar'
          description='Every date is classified as a working day or a weekly off, and none as a holiday, until one is added on the holiday calendars screen.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {holidays.map((holiday) => {
                const Icon = TYPE_ICON[holiday.type];
                return (
                  <TableRow key={holiday._id} hover>
                    <TableCell>
                      <Typography variant='mono'>{holiday.date}</Typography>
                    </TableCell>
                    <TableCell>{holiday.name}</TableCell>
                    <TableCell>
                      <Chip
                        variant='statusInfo'
                        icon={Icon ? <Icon fontSize='small' /> : undefined}
                        label={TYPE_LABEL[holiday.type] ?? holiday.type}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

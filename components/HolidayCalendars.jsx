'use client';

import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useOrgMutations } from '../hooks/useOrgMutations.js';
import { CalendarFormDialog } from './calendar/CalendarFormDialog.jsx';
import { CalendarTeamsPanel } from './calendar/CalendarTeamsPanel.jsx';
import { HolidaysPanel } from './calendar/HolidaysPanel.jsx';
import { WeeklyOffPanel } from './calendar/WeeklyOffPanel.jsx';
import { EmptyState } from './EmptyState.jsx';
import { PageHeader } from './PageHeader.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

const TABS = ['Holidays', 'Weekly off', 'Teams'];

/**
 * Sunday is 0 through Saturday 6, matching what the database stores. Spelled
 * out at the summary rather than shown as numbers, because "6, 0" tells a
 * reader nothing (`NFR-2`).
 */
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function summarise(calendar) {
  const teams = calendar.teams.length;
  const days = calendar.weeklyOffPattern?.daysOfWeek ?? null;

  const off =
    days === null
      ? 'no weekly off set'
      : days.length === 0
        ? 'works every day'
        : `off ${days.map((day) => DAY_NAMES[day]).join(' and ')}`;

  return `${teams} team${teams === 1 ? '' : 's'} · ${calendar.holidays.length} holiday${
    calendar.holidays.length === 1 ? '' : 's'
  } · ${off}`;
}

function CalendarPanels({ calendar, teams, canWrite, mutations }) {
  const [tab, setTab] = useState(0);

  return (
    <Stack spacing={3}>
      <Tabs
        value={tab}
        onChange={(_event, next) => setTab(next)}
        variant='scrollable'
        scrollButtons='auto'
      >
        {TABS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      {tab === 0 ? (
        <HolidaysPanel
          holidays={calendar.holidays}
          canWrite={canWrite}
          mutations={mutations}
          calendarId={calendar._id}
        />
      ) : null}

      {tab === 1 ? (
        <WeeklyOffPanel
          pattern={calendar.weeklyOffPattern}
          canWrite={canWrite}
          mutations={mutations}
          calendarId={calendar._id}
        />
      ) : null}

      {tab === 2 ? (
        <CalendarTeamsPanel
          calendarId={calendar._id}
          teams={teams}
          canWrite={canWrite}
          mutations={mutations}
        />
      ) : null}
    </Stack>
  );
}

/**
 * `S-26`. The holiday calendars the whole company observes, and which team
 * sits on which.
 *
 * A calendar is shared, not owned: two or three serve every team, and none is
 * created automatically when a team is created (`FR-3.7`). That is why the
 * weekly off pattern lives here rather than on the team — the calendar already
 * answers which dates are not working days, and two owners for one question
 * would let a team observe one calendar's holidays on another's working week.
 *
 * Pure: every list arrives as a prop and every action leaves through a
 * callback. The viewer's permission arrives as `canWrite` rather than a role
 * name, so moving config.write on `S-19` changes this screen with no code
 * change.
 */
export function HolidayCalendars({ calendars, teams, canWrite }) {
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const mutations = useOrgMutations();
  const {
    createCalendar,
    renameCalendar,
    softDeleteCalendar,
    conflict,
    dismissConflict,
    pending,
    error,
  } = mutations;

  const unassigned = teams.filter((team) => !team.calendarId);

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Holiday calendars'
        description='The holidays and non-working days every team observes. A calendar is shared — two or three serve the whole company — so editing one changes the working week of every team assigned to it, and each of those teams is recalculated.'
        actions={
          canWrite ? (
            <Button variant='contained' onClick={() => setEditing({})}>
              New calendar
            </Button>
          ) : null
        }
      />

      {conflict ? (
        <Alert severity='warning' onClose={dismissConflict}>
          This calendar changed since you loaded it, so your write was rejected
          rather than overwriting theirs. Reload to see the current state.
        </Alert>
      ) : null}

      {unassigned.length > 0 ? (
        <Alert severity='warning'>
          {unassigned.map((team) => team.name).join(', ')} observe
          {unassigned.length === 1 ? 's' : ''} no calendar, so no date is a
          holiday or a weekly off for{' '}
          {unassigned.length === 1 ? 'that team' : 'those teams'}. Nothing is
          assumed — not even Saturday and Sunday — so this stays outstanding on
          the exceptions queue until a calendar is assigned below.
        </Alert>
      ) : null}

      {calendars.length === 0 ? (
        <EmptyState
          title='No calendar exists yet'
          description='Every team is unconfigured until one is created here and assigned. A calendar is never created automatically with a team, because several teams are meant to share one.'
        />
      ) : (
        <Stack spacing={2}>
          {calendars.map((calendar) => (
            <Accordion key={calendar._id} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{
                    alignItems: { sm: 'center' },
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <Stack spacing={1}>
                    <Typography variant='sectionTitle'>
                      {calendar.name}
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {summarise(calendar)}
                    </Typography>
                  </Stack>

                  {canWrite ? (
                    <Stack direction='row' spacing={1}>
                      <IconButton
                        aria-label={`Rename ${calendar.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(calendar);
                        }}
                      >
                        <EditOutlined fontSize='small' />
                      </IconButton>
                      <IconButton
                        aria-label={`Remove ${calendar.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRemoving(calendar);
                        }}
                      >
                        <DeleteOutlined fontSize='small' />
                      </IconButton>
                    </Stack>
                  ) : null}
                </Stack>
              </AccordionSummary>

              <AccordionDetails>
                <CalendarPanels
                  calendar={calendar}
                  teams={teams}
                  canWrite={canWrite}
                  mutations={mutations}
                />
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      )}

      <CalendarFormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={(data) =>
          editing?._id
            ? renameCalendar(editing._id, { ...data, version: editing.version })
            : createCalendar(data)
        }
        initial={editing?._id ? editing : null}
        pending={pending}
        error={error}
      />

      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) =>
          softDeleteCalendar(removing._id, {
            reason,
            version: removing.version,
          })
        }
        title={`Remove ${removing?.name ?? 'this calendar'}`}
        description='Refused while any team is still assigned — move those teams to another calendar first, or removing this one would leave them with no working week at all. Nothing is destroyed: a day record computed while this calendar was live can still explain why.'
        confirmLabel='Remove'
        confirmColor='error'
        pending={pending}
        error={error}
      />
    </Stack>
  );
}

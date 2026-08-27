'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { EmptyState } from '../EmptyState.jsx';

/**
 * Which teams observe this calendar (`FR-3.7`).
 *
 * A team holds exactly one calendar, so ticking one already on another
 * **moves** it. The label says which calendar it would leave: a control that
 * looked like a free choice would hide a change to a second team's working
 * week behind a click meant for this one.
 */
export function CalendarTeamsPanel({ calendarId, teams, canWrite, mutations }) {
  const assigned = teams
    .filter((team) => team.calendarId === calendarId)
    .map((team) => team._id);

  const [selected, setSelected] = useState(assigned);
  const { setCalendarTeams, pending, error } = mutations;

  const toggle = (teamId) => () =>
    setSelected((current) =>
      current.includes(teamId)
        ? current.filter((each) => each !== teamId)
        : [...current, teamId],
    );

  const handleSubmit = async (event) => {
    event.preventDefault();
    await setCalendarTeams(calendarId, { teamIds: selected });
  };

  const moving = teams.filter(
    (team) =>
      selected.includes(team._id) &&
      team.calendarId &&
      team.calendarId !== calendarId,
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <Typography variant='body2' color='text.secondary'>
          Every team observing this calendar. A team holds exactly one, so
          adding a team that is already on another moves it — and both teams are
          recalculated, because the day type of every date changes for the one
          leaving as much as for the one arriving.
        </Typography>

        {error ? <Alert severity='error'>{error}</Alert> : null}

        {moving.length > 0 ? (
          <Alert severity='warning'>
            {moving.map((team) => team.name).join(', ')} will be moved off{' '}
            {moving.length === 1 ? 'its' : 'their'} current calendar.
          </Alert>
        ) : null}

        {teams.length === 0 ? (
          <EmptyState
            title='There are no teams yet'
            description='A calendar can exist with no team on it. Teams are created on the Teams screen, and assigned here afterwards.'
          />
        ) : (
          <Paper variant='outlined'>
            <Stack sx={{ p: 3 }}>
              {teams.map((team) => (
                <FormControlLabel
                  key={team._id}
                  control={
                    <Checkbox
                      checked={selected.includes(team._id)}
                      onChange={toggle(team._id)}
                      disabled={!canWrite}
                    />
                  }
                  label={
                    team.calendarId && team.calendarId !== calendarId
                      ? `${team.name} — on another calendar: ${team.calendarName}`
                      : team.name
                  }
                />
              ))}
            </Stack>
          </Paper>
        )}

        {canWrite && teams.length > 0 ? (
          <Stack direction='row'>
            <Button type='submit' variant='contained' loading={pending}>
              Save assigned teams
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </form>
  );
}

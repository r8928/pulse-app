'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

/**
 * Sunday is 0 through Saturday 6, matching `Date#getDay` and what the database
 * stores. The names are shown rather than the numbers: `NFR-2` forbids an
 * unexplained abbreviation, and "6, 0" tells a reader nothing.
 */
const DAYS = [
  [0, 'Sunday'],
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
];

/**
 * P-32. Which days this team does not work.
 *
 * `FR-3.8` is explicit that this is not assumed to be Saturday and Sunday, so
 * nothing is pre-ticked for a team that has never set one — the absence is
 * flagged as outstanding instead.
 */
export function WeeklyOffPanel({ pattern, canWrite, mutations, teamId }) {
  const [days, setDays] = useState(pattern?.daysOfWeek ?? []);
  const { setWeeklyOff, pending, error } = mutations;

  const toggle = (day) => () =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((each) => each !== day)
        : [...current, day].sort((a, b) => a - b),
    );

  const handleSubmit = async (event) => {
    event.preventDefault();
    await setWeeklyOff(teamId, {
      daysOfWeek: days,
      version: pattern?.version ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <Typography variant='body2' color='text.secondary'>
          The days this team does not work. Not assumed to be Saturday and
          Sunday — a team that works every day leaves all seven unticked, which
          is a real answer rather than an unset one.
        </Typography>

        {error ? <Alert severity='error'>{error}</Alert> : null}

        {pattern ? null : (
          <Alert severity='warning'>
            No pattern is set for this team yet, so no date can be classified as
            a weekly off. Saving below sets one, including saving it empty.
          </Alert>
        )}

        <Paper variant='outlined'>
          <Stack sx={{ p: 3 }}>
            {DAYS.map(([day, label]) => (
              <FormControlLabel
                key={day}
                control={
                  <Checkbox
                    checked={days.includes(day)}
                    onChange={toggle(day)}
                    disabled={!canWrite}
                  />
                }
                label={label}
              />
            ))}
          </Stack>
        </Paper>

        {canWrite ? (
          <Stack direction='row'>
            <Button type='submit' variant='contained' loading={pending}>
              Save weekly off pattern
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </form>
  );
}

'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { useRouter } from 'next/navigation';
import { DAILY_VIEW } from '../../constants/index.js';
import { periodQuery } from '../../utils/period.js';
import { PeriodFilter } from './PeriodFilter.jsx';

/**
 * Page 2's two views and the filters each of them takes.
 *
 * The view lives in the URL rather than in component state, so a link to the
 * day-by-day view of one team's month is a link someone can send. It also
 * means the server renders one view and not both — the by-date grid MATERIALISES
 * records when it opens (`D-15`), which is not something a hidden tab may do.
 *
 * The by-date grid is offered only to writers. It is an editing surface, and
 * opening it writes; a reader given the tab would hit a 403 by clicking a
 * thing they could see.
 */
export function DailyAttendanceFilters({
  view,
  teams,
  people,
  period,
  filters,
  canWrite,
}) {
  const router = useRouter();

  const go = (next) => {
    const merged = {
      view,
      teamId: filters.teamId,
      date: filters.date,
      userIds: filters.userIds?.join(',') ?? '',
      ...periodQuery(period),
      ...next,
    };

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, String(value));
    }

    router.push(`/attendance/daily?${query}`);
  };

  const selected = people.filter((person) =>
    (filters.userIds ?? []).includes(person._id),
  );

  return (
    <Stack spacing={2}>
      <Tabs
        value={view}
        onChange={(_event, next) => go({ view: next })}
        aria-label='Daily attendance view'
      >
        {canWrite ? <Tab value={DAILY_VIEW.BY_DATE} label='By date' /> : null}
        <Tab value={DAILY_VIEW.DAY_BY_DAY} label='Day by day' />
      </Tabs>

      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' } }}
          >
            <TextField
              select
              label='Team'
              value={filters.teamId ?? ''}
              onChange={(event) => go({ teamId: event.target.value })}
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              sx={{ minWidth: 220 }}
            >
              {view === DAILY_VIEW.BY_DATE ? null : (
                <MenuItem value=''>Every team</MenuItem>
              )}
              {teams.map((team) => (
                <MenuItem key={team._id} value={team._id}>
                  {team.name}
                </MenuItem>
              ))}
            </TextField>

            {view === DAILY_VIEW.BY_DATE ? (
              <TextField
                label='Date'
                type='date'
                value={filters.date}
                onChange={(event) => go({ date: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            ) : (
              <PeriodFilter
                period={period}
                onChange={(next) =>
                  // A period change replaces both keys, so switching from a
                  // custom range to a week cannot leave a stale from/to behind.
                  go({ mode: '', anchor: '', from: '', to: '', ...next })
                }
              />
            )}
          </Stack>

          {view === DAILY_VIEW.DAY_BY_DAY ? (
            <Autocomplete
              multiple
              options={people}
              value={selected}
              getOptionLabel={(person) => person.fullName}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              onChange={(_event, chosen) =>
                go({ userIds: chosen.map((person) => person._id).join(',') })
              }
              renderValue={(value, getItemProps) =>
                value.map((person, index) => (
                  <Chip
                    variant='outlined'
                    label={person.fullName}
                    {...getItemProps({ index })}
                    key={person._id}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label='Colleagues'
                  placeholder='Everyone in the team'
                  helperText='Leave empty for everyone the team filter reaches.'
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )}
            />
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}

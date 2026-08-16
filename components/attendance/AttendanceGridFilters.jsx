'use client';

import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useRouter } from 'next/navigation';

/**
 * S-10's two filters. They live in the URL rather than in component state, so
 * a particular team and date is a link an administrator can send to a
 * colleague — and so the server component can read them and load exactly that
 * day (§10.1).
 */
export function AttendanceGridFilters({ teams, teamId, date }) {
  const router = useRouter();

  const go = (next) => {
    const query = new URLSearchParams({ teamId, date, ...next });
    router.push(`/attendance/entry?${query.toString()}`);
  };

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label='Team'
          value={teamId}
          onChange={(event) => go({ teamId: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 220 }}
        >
          {teams.map((team) => (
            <MenuItem key={team._id} value={team._id}>
              {team.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label='Date'
          type='date'
          value={date}
          onChange={(event) => go({ date: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
    </Paper>
  );
}

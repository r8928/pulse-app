'use client';

import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useRouter } from 'next/navigation';

/**
 * `S-10`'s filters: one team, one date.
 *
 * There were briefly two views here. The detailed day-by-day report moved to
 * a popup on the summary, where the reader already has the period and the team
 * chosen — so this is the write surface again and nothing else, which is what
 * makes the whole page gate on `attendance.write` honestly.
 */
export function DailyAttendanceFilters({ teams, teamId, date }) {
  const router = useRouter();

  const go = (next) => {
    const query = new URLSearchParams({ teamId, date, ...next });
    router.push(`/attendance/daily?${query}`);
  };

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'center' } }}
      >
        <TextField
          select
          label='Team'
          value={teamId ?? ''}
          onChange={(event) => go({ teamId: event.target.value })}
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
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

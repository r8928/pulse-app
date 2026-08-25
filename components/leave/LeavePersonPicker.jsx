'use client';

import ChevronRight from '@mui/icons-material/ChevronRight';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { hideBelow } from '../../utils/columnPriority.js';
import { EmptyState } from '../EmptyState.jsx';
import { OpeningBalanceDialog } from './OpeningBalanceDialog.jsx';

/**
 * Page 3's front door for anyone whose leave permission reaches more than
 * themselves: choose a colleague, read their balance history.
 *
 * A colleague whose scope is SELF never sees this — `proxy.js` sends them
 * straight to their own history, because a list of one person they have to
 * click through is a step that exists only to be skipped.
 *
 * The search filters what is already on the page rather than re-querying. The
 * roster is bounded by the viewer's scope and read in one call, so a round
 * trip per keystroke would buy nothing.
 */
export function LeavePersonPicker({
  people,
  teams,
  filters,
  leaveTypes = [],
  canWrite = false,
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? people.filter(
        (person) =>
          person.fullName.toLowerCase().includes(needle) ||
          person.employeeCode.toLowerCase().includes(needle),
      )
    : people;

  const go = (next) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...next })) {
      if (value) query.set(key, String(value));
    }
    router.push(`/leave?${query}`);
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
            label='Search'
            placeholder='Name or code'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 240 }}
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
            sx={{ minWidth: 220 }}
          >
            <MenuItem value=''>Every team</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team._id} value={team._id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>

          {/* P-19, FR-6.13. Cutover only, and it lives here because this is
              the screen that lists the people it is entered against — the
              balances table it used to sit on is now part of page 1. */}
          {canWrite ? (
            <Button
              type='button'
              variant='outlined'
              sx={{ ml: { md: 'auto' } }}
              onClick={() => setDialog('opening')}
            >
              Set opening balance
            </Button>
          ) : null}
        </Stack>
      </Paper>

      <OpeningBalanceDialog
        people={people}
        leaveTypes={leaveTypes}
        open={dialog === 'opening'}
        onClose={() => setDialog(null)}
      />

      {shown.length === 0 ? (
        <EmptyState
          title='No colleague matches'
          description='Nobody in this team matches that search. Clearing either filter widens it.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell sx={hideBelow('sm')}>Code</TableCell>
                <TableCell sx={hideBelow('md')}>Team</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>

            <TableBody>
              {shown.map((person) => (
                <TableRow key={person._id} hover>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Link href={`/leave/${person._id}/ledger`}>
                        {person.fullName}
                      </Link>
                      {person.noLongerActive ? (
                        <Chip
                          variant='statusNeutral'
                          label='No longer active'
                        />
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell sx={hideBelow('sm')}>
                    <Typography variant='mono'>
                      {person.employeeCode}
                    </Typography>
                  </TableCell>
                  <TableCell sx={hideBelow('md')}>
                    <Typography variant='body2' color='text.secondary'>
                      {person.teamName ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align='right'>
                    <Link
                      href={`/leave/${person._id}/ledger`}
                      aria-label={`Open ${person.fullName}'s balance history`}
                    >
                      <ChevronRight />
                    </Link>
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

'use client';

import Alert from '@mui/material/Alert';
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
import { EmptyState } from '../EmptyState.jsx';
import { OpeningBalanceDialog } from './OpeningBalanceDialog.jsx';

/**
 * S-13. Typed leave balances, every figure replayed from the ledger and never
 * stored (DC-4, FR-6.8).
 *
 * Each cell shows the balance with the movements that produced it underneath —
 * opening, credited, availed, deducted — because a balance on its own is a
 * number to be argued with, and the breakdown is what answers NFR-11 before
 * the reader even reaches S-14.
 *
 * FR-6.9: paternity and maternity are typed balances like any other and never
 * touch the standard one. That falls out of every type having its own column
 * rather than being a special case anywhere.
 */
export function LeaveBalances({
  rows,
  teams,
  leaveTypes,
  wfhQuota,
  filters,
  canWrite,
  viewerId = null,
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);

  const go = (next) => {
    const merged = { ...filters, ...next };
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(merged)) {
      if (value !== '' && value !== null && value !== false) {
        query.set(key, String(value));
      }
    }

    router.push(`/leave?${query.toString()}`);
  };

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ md: 'center' }}
        >
          <TextField
            label='From'
            type='date'
            value={filters.from}
            onChange={(event) => go({ from: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label='To'
            type='date'
            value={filters.to}
            onChange={(event) => go({ to: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
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
            sx={{ minWidth: 200 }}
          >
            <MenuItem value=''>Every team</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team._id} value={team._id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>

          {viewerId ? (
            <Button
              type='button'
              variant={filters.userId === viewerId ? 'contained' : 'outlined'}
              onClick={() =>
                go({ userId: filters.userId === viewerId ? '' : viewerId })
              }
            >
              Just me
            </Button>
          ) : null}

          {canWrite ? (
            <Button
              type='button'
              variant='outlined'
              onClick={() => setDialog('opening')}
            >
              Set opening balance
            </Button>
          ) : null}
        </Stack>
      </Paper>

      <Alert severity='info'>
        Every figure here is replayed from the ledger and never stored, so each
        one links to the movements that produced it.
      </Alert>

      {rows.length === 0 ? (
        <EmptyState
          title='No balances in this range'
          description='Nothing has moved a balance for the colleagues this filter reaches. Entitlements credit themselves the first time anything looks at a date inside the leave year.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                {leaveTypes.map((type) => (
                  <TableCell key={type}>{type}</TableCell>
                ))}
                <TableCell>WFH used</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Link href={`/leave/${row.userId}/ledger`}>
                        {row.fullName}
                      </Link>
                      <Typography variant='caption' color='text.secondary'>
                        {row.employeeCode}
                      </Typography>
                      {row.deletedAt ? (
                        <Chip
                          variant='statusNeutral'
                          label='No longer active'
                        />
                      ) : null}
                    </Stack>
                  </TableCell>

                  {leaveTypes.map((type) => {
                    const figures = row.byType[type];

                    return (
                      <TableCell key={type}>
                        {figures ? (
                          <Stack spacing={0.25}>
                            <Typography variant='bodyStrong'>
                              {figures.balance}
                            </Typography>
                            <Typography
                              variant='caption'
                              color='text.secondary'
                            >
                              opening {figures.opening} · credited{' '}
                              {figures.credited} · availed {figures.availed} ·
                              deducted {figures.deductions}
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography color='text.secondary'>—</Typography>
                        )}
                      </TableCell>
                    );
                  })}

                  <TableCell>
                    <Typography variant='mono'>
                      {row.wfhUsed} of {wfhQuota}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {dialog === 'opening' ? (
        <OpeningBalanceDialog
          people={rows.map((row) => ({
            _id: row.userId,
            fullName: row.fullName,
          }))}
          leaveTypes={leaveTypes}
          open
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Stack>
  );
}

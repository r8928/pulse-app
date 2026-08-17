'use client';

import Alert from '@mui/material/Alert';
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
import { useRouter } from 'next/navigation';
import { LEDGER_ENTRY_TYPE } from '../../constants/index.js';
import { EmptyState } from '../EmptyState.jsx';

/**
 * S-14. Every immutable balance movement, in order, with the rule that
 * produced it — the proof behind every number the app displays (NFR-11,
 * MVP criterion 11).
 *
 * **Read only by design.** There is no edit or delete control anywhere on this
 * screen, because no endpoint exists to call: FR-6.8 makes the ledger
 * append-only, and a movement is cancelled by appending its reverse.
 */

const READABLE = (entryType) => entryType.toLowerCase().replaceAll('_', ' ');

const SIGNED = (amount) => (amount > 0 ? `+${amount}` : String(amount));

/** Entries of note carry their own label, per §26.3. */
const NOTES = {
  [LEDGER_ENTRY_TYPE.OPENING_BALANCE]: 'Entered at cutover by hand',
  [LEDGER_ENTRY_TYPE.LAPSED_ON_DEPARTURE]: 'Lapsed on departure',
  [LEDGER_ENTRY_TYPE.PTO_EXPIRY]: 'PTO expired',
};

export function LedgerTrace({
  user,
  entries,
  hasOpeningBalance,
  leaveTypes,
  filters,
}) {
  const router = useRouter();

  const go = (leaveType) => {
    const query = new URLSearchParams();
    if (leaveType) query.set('leaveType', leaveType);
    router.push(`/leave/${user._id}/ledger?${query.toString()}`);
  };

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <TextField
          select
          label='Leave type'
          value={filters.leaveType ?? ''}
          onChange={(event) => go(event.target.value)}
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value=''>Every type</MenuItem>
          {leaveTypes.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {!hasOpeningBalance ? (
        <Alert severity='info'>
          {user.fullName} has no opening balance. A colleague who joined after
          cutover has none — their balance starts from what has been credited
          since, not from a figure carried over.
        </Alert>
      ) : null}

      <Alert severity='info'>
        Nothing on this screen can be edited or deleted. A movement is cancelled
        by appending its reverse, which is why a corrected figure shows as two
        entries rather than one changed one.
      </Alert>

      {entries.length === 0 ? (
        <EmptyState
          title='No movements yet'
          description='Nothing has moved this balance. Entries appear as leave is recorded, as the engine deducts, and as an administrator credits or corrects.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Movement</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Balance after</TableCell>
                <TableCell>Rule</TableCell>
                <TableCell>Who and why</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {entries.map((entry) => (
                <TableRow key={String(entry._id)}>
                  <TableCell>
                    <Typography variant='mono'>{entry.date}</Typography>
                  </TableCell>

                  <TableCell>
                    <Stack spacing={0.5} alignItems='flex-start'>
                      <span>{READABLE(entry.entryType)}</span>
                      {entry.reversalOf ? (
                        <Chip
                          variant='statusWarning'
                          label='Cancels an earlier movement'
                        />
                      ) : null}
                      {NOTES[entry.entryType] ? (
                        <Chip
                          variant='statusNeutral'
                          label={NOTES[entry.entryType]}
                        />
                      ) : null}
                    </Stack>
                  </TableCell>

                  <TableCell>{entry.leaveType}</TableCell>

                  <TableCell>
                    <Typography variant='mono'>
                      {SIGNED(entry.amount)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant='mono'>
                      {entry.runningBalance}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant='mono'>{entry.rule ?? '—'}</Typography>
                  </TableCell>

                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant='body2'>{entry.actorName}</Typography>
                      {entry.reason ? (
                        <Typography variant='caption' color='text.secondary'>
                          {entry.reason}
                        </Typography>
                      ) : null}
                    </Stack>
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

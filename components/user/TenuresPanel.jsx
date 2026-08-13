'use client';

import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { ReasonDialog } from '../ReasonDialog.jsx';

/**
 * P-17 and P-18. FR-2.12: employment is one or more tenures, each an unbroken
 * period, and the gap between two of them is precisely what says the user was
 * not employed then.
 *
 * Two rules are stated on the screen rather than only enforced by the server,
 * because both surprise people: editing corrects a wrong date but cannot close
 * an open tenure, and a user always keeps at least one that is not soft
 * deleted.
 */
export function TenuresPanel({ user, canWrite, mutations }) {
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { createTenure, updateTenure, softDeleteTenure, pending, error } =
    mutations;

  useEffect(() => {
    if (editing) {
      setStartDate(editing.startDate ?? '');
      setEndDate(editing.endDate ?? '');
    }
  }, [editing]);

  const live = user.tenures.filter((tenure) => !tenure.deletedAt);

  return (
    <Stack spacing={2}>
      <Alert severity='info'>
        The employment period is every tenure below added together, worked out
        when needed and never stored. A date in a gap between two tenures
        carries no day record, exception or deduction. A long absence sits
        inside one tenure and is recorded as leave — a tenure is not a way to
        record absence.
      </Alert>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Typography variant='body2' color='text.secondary'>
          Date of joining is the earliest start; date of leaving is the most
          recent closed end, and is empty while a tenure is open. Both are
          rewritten whenever a tenure changes, so neither can drift.
        </Typography>
        {canWrite ? (
          <Button variant='contained' onClick={() => setEditing({})}>
            Add a tenure
          </Button>
        ) : null}
      </Stack>

      <Paper variant='outlined'>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell>Status</TableCell>
              {canWrite ? <TableCell>Actions</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {user.tenures.map((tenure) => (
              <TableRow key={tenure._id} hover>
                <TableCell>
                  <Typography variant='mono'>{tenure.startDate}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant='mono'>
                    {tenure.endDate ?? '— open'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    variant={
                      tenure.deletedAt ? 'statusNeutral' : 'statusSuccess'
                    }
                    label={tenure.deletedAt ? 'Soft deleted' : 'Counted'}
                  />
                </TableCell>
                {canWrite ? (
                  <TableCell>
                    <Stack direction='row' spacing={1}>
                      <IconButton
                        aria-label={`Edit the tenure starting ${tenure.startDate}`}
                        disabled={Boolean(tenure.deletedAt)}
                        onClick={() => setEditing(tenure)}
                      >
                        <EditOutlined fontSize='small' />
                      </IconButton>
                      <IconButton
                        aria-label={`Soft delete the tenure starting ${tenure.startDate}`}
                        disabled={Boolean(tenure.deletedAt) || live.length <= 1}
                        title={
                          live.length <= 1
                            ? 'This is their only counted tenure, and every user keeps at least one.'
                            : undefined
                        }
                        onClick={() => setRemoving(tenure)}
                      >
                        <DeleteOutlined fontSize='small' />
                      </IconButton>
                    </Stack>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <ReasonDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onConfirm={(reason) =>
          editing?._id
            ? updateTenure(editing._id, {
                startDate,
                ...(editing.endDate ? { endDate } : {}),
                reason,
                version: editing.version,
              })
            : createTenure(user._id, {
                startDate,
                endDate: endDate || null,
                reason,
              })
        }
        title={editing?._id ? 'Correct this tenure' : 'Add a tenure'}
        description={
          editing?._id
            ? 'Corrects a wrong date. It cannot close an open tenure — a date of leaving is set by soft deleting the user, which is the only thing that closes one.'
            : 'A period of employment that is not already recorded, such as an earlier spell before a re-hire. It may not overlap another tenure of this user.'
        }
        confirmLabel={editing?._id ? 'Correct dates' : 'Add tenure'}
        pending={pending}
        error={error}
      >
        <TextField
          label='Start date'
          type='date'
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {editing?._id && !editing.endDate ? (
          <Alert severity='info'>
            This tenure is open, so it has no end date to correct. Soft deleting
            the user is what closes it.
          </Alert>
        ) : (
          <TextField
            label='End date'
            type='date'
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            helperText='Leave empty for a period that is still open.'
          />
        )}
      </ReasonDialog>

      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) =>
          softDeleteTenure(removing._id, { reason, version: removing.version })
        }
        title='Soft delete this tenure'
        description='The dates it covered leave the employment period, and both stored employment dates are rewritten. Nothing is destroyed and the tenure can be restored. Refused if it is the only one this user has left.'
        confirmLabel='Soft delete'
        confirmColor='error'
        pending={pending}
        error={error}
      />
    </Stack>
  );
}

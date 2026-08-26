'use client';

import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
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
import { formatClockTime } from '../../utils/time.js';
import { EmptyState } from '../EmptyState.jsx';
import { ReasonDialog } from '../ReasonDialog.jsx';

const EMPTY = {
  name: '',
  startTime: '',
  endTime: '',
  requiredDailyMinutes: '',
  graceMinutes: '',
  timezone: '',
};

/**
 * P-30. Named shifts, per team (`FR-3.3`).
 *
 * The timezone is a required field with no default offered, because there is
 * deliberately no company-wide one to fall back on (`FR-3.10`, `DC-5`) and
 * `DC-6` forbids guessing it.
 */
function ShiftDialog({ open, onClose, onSubmit, pending, error, initial }) {
  const [values, setValues] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? {
              name: initial.name,
              startTime: initial.startTime,
              endTime: initial.endTime,
              requiredDailyMinutes: String(initial.requiredDailyMinutes),
              graceMinutes: String(initial.graceMinutes),
              timezone: initial.timezone,
            }
          : EMPTY,
      );
    }
  }, [open, initial]);

  const set = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    const saved = await onSubmit({
      name: values.name.trim(),
      startTime: values.startTime,
      endTime: values.endTime,
      requiredDailyMinutes: Number(values.requiredDailyMinutes),
      graceMinutes: Number(values.graceMinutes),
      timezone: values.timezone.trim(),
    });

    if (saved) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{initial ? 'Edit shift' : 'New shift'}</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}

            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField
                  label='Name'
                  value={values.name}
                  onChange={set('name')}
                  required
                  fullWidth
                  autoFocus
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='Start time'
                  type='time'
                  value={values.startTime}
                  onChange={set('startTime')}
                  required
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='End time'
                  type='time'
                  value={values.endTime}
                  onChange={set('endTime')}
                  required
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText='Earlier than the start time means the shift crosses midnight, which is ordinary rather than an error.'
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='Required daily duration, in minutes'
                  type='number'
                  value={values.requiredDailyMinutes}
                  onChange={set('requiredDailyMinutes')}
                  required
                  fullWidth
                  helperText='What a full day owes. A day below the short-day threshold of this is a short day.'
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='Grace period, in minutes'
                  type='number'
                  value={values.graceMinutes}
                  onChange={set('graceMinutes')}
                  required
                  fullWidth
                  helperText='Arriving within this is compliant. It decides whether a day is late, never by how much.'
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  label='Timezone'
                  value={values.timezone}
                  onChange={set('timezone')}
                  required
                  fullWidth
                  helperText='An IANA name such as Asia/Karachi or America/Los_Angeles. Required: every timestamp resolves through this, and there is deliberately no company-wide default to fall back on.'
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' loading={pending}>
            {initial ? 'Save shift' : 'Create shift'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function ShiftsPanel({
  shifts,
  defaultShiftId,
  canWrite,
  mutations,
  onSetDefault,
}) {
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const { createShift, updateShift, softDeleteShift, pending, error } =
    mutations;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Typography variant='body2' color='text.secondary'>
          Shifts belong to this team. Each carries its own timezone, and the
          team default is what a user with no shift of their own takes.
        </Typography>
        {canWrite ? (
          <Button variant='contained' onClick={() => setEditing({})}>
            New shift
          </Button>
        ) : null}
      </Stack>

      {shifts.length === 0 ? (
        <EmptyState
          title='No shift yet'
          description='No day can be classified without one: a shift supplies the start, the required duration, the grace period and the timezone every calculation resolves through.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Required</TableCell>
                <TableCell>Grace</TableCell>
                <TableCell>Timezone</TableCell>
                <TableCell>Default</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift._id} hover>
                  <TableCell>{shift.name}</TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {formatClockTime(shift.startTime)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {formatClockTime(shift.endTime)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {shift.requiredDailyMinutes} min
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {shift.graceMinutes} min
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{shift.timezone}</Typography>
                  </TableCell>
                  <TableCell>
                    {shift._id === defaultShiftId ? (
                      <Chip variant='statusSuccess' label='Team default' />
                    ) : canWrite ? (
                      <Button
                        size='small'
                        onClick={() => onSetDefault(shift._id)}
                      >
                        Make default
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {canWrite ? (
                      <Stack direction='row' spacing={1}>
                        <IconButton
                          aria-label={`Edit ${shift.name}`}
                          onClick={() => setEditing(shift)}
                        >
                          <EditOutlined fontSize='small' />
                        </IconButton>
                        <IconButton
                          aria-label={`Soft delete ${shift.name}`}
                          onClick={() => setRemoving(shift)}
                        >
                          <DeleteOutlined fontSize='small' />
                        </IconButton>
                      </Stack>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <ShiftDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={(data) =>
          editing?._id
            ? updateShift(editing._id, { ...data, version: editing.version })
            : createShift(data)
        }
        initial={editing?._id ? editing : null}
        pending={pending}
        error={error}
      />

      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) =>
          softDeleteShift(removing._id, { reason, version: removing.version })
        }
        title={`Soft delete ${removing?.name ?? 'this shift'}`}
        description='Nothing is destroyed — day records already computed under this shift still resolve it. The removal is refused while it is the team default, because a user holding no shift of their own would have nothing to take.'
        confirmLabel='Soft delete'
        confirmColor='error'
        pending={pending}
        error={error}
      />
    </Stack>
  );
}

'use client';

import CelebrationOutlined from '@mui/icons-material/CelebrationOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
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
import { useEffect, useState } from 'react';
import { HOLIDAY_TYPE } from '../../constants/index.js';
import { EmptyState } from '../EmptyState.jsx';
import { ReasonDialog } from '../ReasonDialog.jsx';

const EMPTY = { date: '', name: '', type: HOLIDAY_TYPE.PUBLIC };

/**
 * The written label for each type. `FR-3.7` is explicit that a calendar shall
 * never depend on formatting or colour, so the type is always spelled out and
 * carries an icon — the chip tint is the third signal, never the only one.
 */
const TYPE_LABEL = {
  [HOLIDAY_TYPE.PUBLIC]: 'Public holiday',
  [HOLIDAY_TYPE.COMPANY]: 'Company holiday',
};

const TYPE_ICON = {
  [HOLIDAY_TYPE.PUBLIC]: EventOutlined,
  [HOLIDAY_TYPE.COMPANY]: CelebrationOutlined,
};

function HolidayDialog({ open, onClose, onSubmit, pending, error, initial }) {
  const [values, setValues] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? { date: initial.date, name: initial.name, type: initial.type }
          : EMPTY,
      );
    }
  }, [open, initial]);

  const set = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const saved = await onSubmit({ ...values, name: values.name.trim() });
    if (saved) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{initial ? 'Edit holiday' : 'New holiday'}</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}

            <TextField
              label='Date'
              type='date'
              value={values.date}
              onChange={set('date')}
              required
              fullWidth
              autoFocus
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              label='Name'
              value={values.name}
              onChange={set('name')}
              required
              fullWidth
            />

            <TextField
              select
              label='Type'
              value={values.type}
              onChange={set('type')}
              required
              fullWidth
              helperText='Stored as a value rather than shown by colour, so a report can count the two kinds apart.'
            >
              {Object.values(HOLIDAY_TYPE).map((type) => (
                <MenuItem key={type} value={type}>
                  {TYPE_LABEL[type]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' loading={pending}>
            {initial ? 'Save holiday' : 'Add holiday'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * P-31. One calendar's holidays (`FR-3.7`).
 *
 * The calendar is shared, so an edit here reaches every team assigned to it.
 * The copy says so: an administrator who believes they are changing one
 * team's days would make a change they did not intend.
 */
export function HolidaysPanel({ holidays, canWrite, mutations, calendarId }) {
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const { createHoliday, updateHoliday, softDeleteHoliday, pending, error } =
    mutations;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Typography variant='body2' color='text.secondary'>
          Every team assigned to this calendar observes these days. Two teams on
          different calendars observe different holidays on the same date, and
          each entry is typed rather than distinguished by colour.
        </Typography>
        {canWrite ? (
          <Button variant='contained' onClick={() => setEditing({})}>
            New holiday
          </Button>
        ) : null}
      </Stack>

      <Alert severity='info'>
        Editing the calendar mid-year is legitimate and recalculates the dates
        it touches, for every team on this calendar. Any override an
        administrator put on one of those days survives it.
      </Alert>

      {holidays.length === 0 ? (
        <EmptyState
          title='No holiday on this calendar'
          description='Every date will be classified as a working day or a weekly off, and none as a holiday, until one is added here.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {holidays.map((holiday) => {
                const Icon = TYPE_ICON[holiday.type];
                return (
                  <TableRow key={holiday._id} hover>
                    <TableCell>
                      <Typography variant='mono'>{holiday.date}</Typography>
                    </TableCell>
                    <TableCell>{holiday.name}</TableCell>
                    <TableCell>
                      <Chip
                        variant='statusInfo'
                        icon={Icon ? <Icon fontSize='small' /> : undefined}
                        label={TYPE_LABEL[holiday.type] ?? holiday.type}
                      />
                    </TableCell>
                    <TableCell>
                      {canWrite ? (
                        <Stack direction='row' spacing={1}>
                          <IconButton
                            aria-label={`Edit ${holiday.name}`}
                            onClick={() => setEditing(holiday)}
                          >
                            <EditOutlined fontSize='small' />
                          </IconButton>
                          <IconButton
                            aria-label={`Soft delete ${holiday.name}`}
                            onClick={() => setRemoving(holiday)}
                          >
                            <DeleteOutlined fontSize='small' />
                          </IconButton>
                        </Stack>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <HolidayDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={(data) =>
          editing?._id
            ? updateHoliday(editing._id, { ...data, version: editing.version })
            : createHoliday({ ...data, calendarId })
        }
        initial={editing?._id ? editing : null}
        pending={pending}
        error={error}
      />

      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) =>
          softDeleteHoliday(removing._id, { reason, version: removing.version })
        }
        title={`Remove ${removing?.name ?? 'this holiday'}`}
        description='The date becomes an ordinary working day or weekly off again, and the days it covered are recalculated. Nothing is destroyed — a day record computed while it was a holiday can still explain why.'
        confirmLabel='Remove'
        confirmColor='error'
        pending={pending}
        error={error}
      />
    </Stack>
  );
}

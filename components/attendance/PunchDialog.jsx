'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { fromZonedTime } from 'date-fns-tz';
import { useState } from 'react';
import { PUNCH_SOURCE, PUNCH_TYPE } from '../../constants/index.js';
import { formatClock } from '../../utils/duration.js';

/**
 * P-21. FR-4.1: a time, a direction, and the user it belongs to.
 *
 * FR-4.12: a wrong punch is fixed by editing it — never by adding a cancelling
 * punch, never by overriding the day — and the correction recalculates both
 * the day it left and the day it moved to. Every such fix is a manual
 * adjustment under FR-4.10, which is why an edit demands a reason and a first
 * recording does not.
 *
 * The time is entered and shown in the SHIFT's timezone (§7.2) and converted
 * to an instant on submit. A form entered in the reader's own zone would put a
 * night shift on the wrong side of midnight for anyone viewing from elsewhere.
 */
export function PunchDialog({
  punch,
  userName,
  timezone,
  workDate,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const isEdit = Boolean(punch);

  const [date, setDate] = useState(workDate);
  const [time, setTime] = useState(
    punch ? formatClock(new Date(punch.at), timezone) : '09:00',
  );
  const [type, setType] = useState(punch?.type ?? PUNCH_TYPE.CHECK_IN);
  const [reason, setReason] = useState('');

  const canSubmit = !pending && Boolean(time) && (!isEdit || reason.trim());

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    onSubmit({
      at: fromZonedTime(`${date}T${time}`, timezone).toISOString(),
      type,
      source: PUNCH_SOURCE.FORM,
      ...(isEdit ? { reason: reason.trim(), version: punch.version } : {}),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{isEdit ? 'Correct punch' : 'Record punch'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              {isEdit
                ? `Correcting ${userName}'s punch. The correction is recorded against
                   this punch rather than cancelled by a second one, and both the day
                   it leaves and the day it joins are recalculated.`
                : `Recording a punch for ${userName}. Times are entered in the
                   timezone of their shift.`}
            </DialogContentText>

            {error ? <Alert severity='error'>{error}</Alert> : null}

            <TextField
              label='Date'
              type='date'
              value={date}
              onChange={(event) => setDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />

            <TextField
              label={`Time (${timezone})`}
              type='time'
              value={time}
              onChange={(event) => setTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />

            <TextField
              select
              label='Type'
              value={type}
              onChange={(event) => setType(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            >
              <MenuItem value={PUNCH_TYPE.CHECK_IN}>Check in</MenuItem>
              <MenuItem value={PUNCH_TYPE.CHECK_OUT}>Check out</MenuItem>
            </TextField>

            {isEdit ? (
              <TextField
                label='Reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                multiline
                minRows={2}
                helperText='Recorded in this punch’s history, so the correction stays explainable.'
                required
              />
            ) : null}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' disabled={!canSubmit}>
            {isEdit ? 'Save correction' : 'Record punch'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

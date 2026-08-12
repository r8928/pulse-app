'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

/**
 * P-46. Wraps every override, soft delete, restore and manual adjustment.
 *
 * FR-4.10 makes the reason mandatory, so the confirm stays disabled until one
 * is typed — enforced here rather than validated after the fact, because a
 * blocked button explains the requirement before the click rather than after.
 *
 * Enter submits and Esc cancels through a real form: primary is type='submit',
 * everything else is type='button'.
 */
export function ReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
  pending,
  error,
  children,
}) {
  const [reason, setReason] = useState('');

  const close = () => {
    setReason('');
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const done = await onConfirm(reason.trim());
    if (done) close();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}
            {description ? (
              <DialogContentText>{description}</DialogContentText>
            ) : null}

            {children}

            <TextField
              label='Reason'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              fullWidth
              multiline
              minRows={2}
              autoFocus
              helperText='Recorded in the audit log with your name and the time. Required.'
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={close}>
            Cancel
          </Button>
          <Button
            type='submit'
            variant='contained'
            color={confirmColor}
            disabled={reason.trim().length === 0}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

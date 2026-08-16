'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/**
 * What P-23, P-24 and P-25 have in common, in one place rather than three.
 *
 * All three state what the engine concluded, take the administrator's
 * replacement beside it (FR-6.11), and demand a reason — the why is as
 * auditable as the what (FR-9.4). Only the field in the middle differs, so
 * only that is passed in.
 *
 * A real form: Enter submits, Esc cancels, `type='button'` on everything that
 * is not the primary action (CLAUDE.md).
 */
export function OverrideDialogShell({
  title,
  description,
  engineLabel,
  engineValue,
  submitLabel,
  canSubmit = true,
  open,
  onClose,
  onSubmit,
  pending,
  error,
  reason,
  onReasonChange,
  children,
}) {
  const enabled = !pending && Boolean(reason.trim()) && canSubmit;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (enabled) onSubmit();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>{description}</DialogContentText>

            {error ? <Alert severity='error'>{error}</Alert> : null}

            <Paper variant='outlined' sx={{ p: 2 }}>
              <Stack spacing={0.5}>
                <Typography variant='metricLabel' color='text.secondary'>
                  {engineLabel}
                </Typography>
                {engineValue}
              </Stack>
            </Paper>

            {children}

            <TextField
              label='Reason'
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              multiline
              minRows={2}
              helperText='Stored beside the value with your name and the time, and shown wherever the day is read.'
              required
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' disabled={!enabled}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

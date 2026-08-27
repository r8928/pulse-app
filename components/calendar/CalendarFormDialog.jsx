'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';

/**
 * Creates or renames a holiday calendar.
 *
 * A name and nothing else. The timezone the engine reads lives on the shift
 * (`FR-3.10`, `DC-5`) and a second one here would be a source of drift with no
 * reader; a description would be one more field to keep true.
 */
export function CalendarFormDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
  initial,
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(initial?.name ?? '');
  }, [open, initial]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const saved = await onSubmit({ name: name.trim() });
    if (saved) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {initial ? 'Rename calendar' : 'New holiday calendar'}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}

            <TextField
              label='Name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              fullWidth
              autoFocus
              helperText='What the teams on it observe — “Pakistan calendar”, “US calendar”. Two live calendars cannot share a name, because the picker that assigns teams could not tell them apart.'
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' loading={pending}>
            {initial ? 'Save name' : 'Create calendar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

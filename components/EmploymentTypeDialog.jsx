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
 * P-40. Creates or renames an employment type.
 *
 * FR-2.6 makes these company-wide configuration rather than an enum, and no
 * permission depends on any of them — which is why this dialog offers no
 * access-related field at all.
 *
 * Enter submits and Esc cancels, via a real form element: the primary button
 * is type='submit' and every other button is type='button', so neither
 * keyboard path depends on a handler being wired correctly.
 */
export function EmploymentTypeDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
  initial,
}) {
  const [name, setName] = useState('');

  // The same dialog serves create and rename, so the field follows whichever
  // record it was opened for rather than keeping the previous one's value.
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
          {initial ? 'Rename employment type' : 'New employment type'}
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
              helperText='Classifies the kind of staff member. No permission depends on it, and every user keeps their attendance whichever type they hold.'
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' loading={pending}>
            {initial ? 'Rename' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

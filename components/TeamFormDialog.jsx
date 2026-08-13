'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { UNASSIGNED } from '../constants/index.js';

const EMPTY = { name: '', managerId: UNASSIGNED };

/**
 * P-28. Creates or edits a team, naming exactly one manager (`FR-3.1`).
 *
 * The manager may be left unset while a team is being set up — a brand-new
 * company has no users to name yet. `S-17` flags it as outstanding rather than
 * the form inventing somebody (`FR-3.13`, `DC-6`).
 *
 * Naming a manager promotes that user to MANAGER in the same operation, which
 * the helper text states before the click rather than surprising the reader
 * after it.
 */
export function TeamFormDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
  initial,
  users,
}) {
  const [values, setValues] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setValues({
        name: initial?.name ?? '',
        managerId: initial?.managerId ?? UNASSIGNED,
      });
    }
  }, [open, initial]);

  const set = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    const saved = await onSubmit({
      name: values.name.trim(),
      // The sentinel means "nobody named yet", which is not the same as an
      // empty string and must not be stored as one.
      managerId: values.managerId === UNASSIGNED ? null : values.managerId,
    });

    if (saved) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{initial ? 'Edit team' : 'New team'}</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}

            <TextField
              label='Name'
              value={values.name}
              onChange={set('name')}
              required
              fullWidth
              autoFocus
            />

            <TextField
              select
              label='Manager'
              value={values.managerId}
              onChange={set('managerId')}
              fullWidth
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              helperText='Exactly one per team. Naming somebody here makes them a MANAGER in the same action, and replaces whoever held it before. Leave it unset while the team is being set up — it will be flagged as outstanding rather than guessed.'
            >
              <MenuItem value={UNASSIGNED}>Not set yet</MenuItem>
              {users.map((user) => (
                <MenuItem key={user._id} value={user._id}>
                  {user.fullName}
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
            {initial ? 'Save' : 'Create team'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

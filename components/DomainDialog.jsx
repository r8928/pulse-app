'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

/**
 * P-41. Authorises a Google Workspace domain for sign in (FR-1.5).
 *
 * There is no rename: a domain is added or removed. Renaming one would
 * silently change who can sign in while reading as an ordinary edit.
 */
export function DomainDialog({ open, onClose, onSubmit, pending, error }) {
  const [domain, setDomain] = useState('');

  const close = () => {
    setDomain('');
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const saved = await onSubmit({ domain: domain.trim() });
    if (saved) close();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Authorise a Workspace domain</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}

            <TextField
              label='Workspace domain'
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              required
              fullWidth
              autoFocus
              helperText='The domain of your Google Workspace, such as example.com — not a full email address. Only accounts on an authorised domain can sign in, and they must also match a user with login enabled.'
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={close}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' loading={pending}>
            Authorise
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

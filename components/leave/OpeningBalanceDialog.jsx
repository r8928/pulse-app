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
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * P-19, FR-6.13. Cutover only.
 *
 * The figure comes from the old workbook by hand: historical attendance is
 * deliberately not migrated, so the system has nothing to compute it from. The
 * reason is mandatory for exactly that reason — it is the only record of where
 * the number came from.
 */
export function OpeningBalanceDialog({ people, leaveTypes, open, onClose }) {
  const router = useRouter();

  const [userId, setUserId] = useState(people[0]?._id ?? '');
  const [leaveType, setLeaveType] = useState(leaveTypes[0] ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('2026-01-01');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const canSubmit =
    !pending && userId && leaveType && amount !== '' && reason.trim();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/leave/opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          leaveType,
          amount: Number(amount),
          date,
          reason: reason.trim(),
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'That was rejected.');

      router.refresh();
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Set opening balance</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              The balance carried from the old workbook at cutover. Pulse cannot
              compute it — historical attendance was deliberately not migrated —
              so it is entered by hand and posts as a ledger entry labelled as
              such.
            </DialogContentText>

            {error ? <Alert severity='error'>{error}</Alert> : null}

            <TextField
              select
              label='Colleague'
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            >
              {people.map((person) => (
                <MenuItem key={person._id} value={person._id}>
                  {person.fullName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label='Leave type'
              value={leaveType}
              onChange={(event) => setLeaveType(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            >
              {leaveTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label='Opening balance'
              type='number'
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              helperText='In days. A negative figure is accepted, because the workbook can produce one.'
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { step: 0.5 },
              }}
            />

            <TextField
              label='Dated'
              type='date'
              value={date}
              onChange={(event) => setDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              label='Reason'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              multiline
              minRows={2}
              helperText='Where this figure came from. It is the only record of that.'
              required
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' disabled={!canSubmit}>
            Post opening balance
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

'use client';

import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';

/**
 * P-27, `FR-7.3`, `FR-6.10`. Extends or changes an approved award's expiry.
 *
 * If the award already expired, the `PTO_EXPIRY` entry it posted is REVERSED
 * rather than edited (`FR-6.8`) before the new date takes over — so the
 * balance is restored and the whole sequence stays readable on S-14.
 */
export function OverrideExpiryDialog({
  award,
  userName,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [expiresAt, setExpiresAt] = useState(award.expiresAt ?? '');
  const [reason, setReason] = useState('');

  return (
    <OverrideDialogShell
      title='Change PTO expiry'
      description={`Changing when ${userName}'s award for ${award.date} stops
        being spendable.`}
      engineLabel='Expires'
      engineValue={
        <Stack spacing={0.5}>
          <Typography variant='bodyStrong'>
            {award.expiresAt ?? 'No expiry recorded'}
          </Typography>
          {award.expiryExtended ? (
            <Typography variant='caption' color='text.secondary'>
              Already extended once when it was approved late.
            </Typography>
          ) : null}
        </Stack>
      }
      submitLabel='Change expiry'
      canSubmit={Boolean(expiresAt)}
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({ expiresAt, reason: reason.trim(), version: award.version })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      reasonHelperText='Stored on the award with your name and the time.'
    >
      <TextField
        label='New expiry'
        type='date'
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <Typography variant='body2' color='text.secondary'>
        If this award has already expired, the expiry movement is reversed and
        the balance restored before the new date applies. Nothing is deleted.
      </Typography>
    </OverrideDialogShell>
  );
}

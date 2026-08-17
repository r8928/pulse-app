'use client';

import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';
import { ProposedByLadder } from './ProposedByLadder.jsx';

/**
 * P-03, `FR-7.8`. Records the actor, the time, the suggested amount and a
 * mandatory reason — and posts nothing.
 *
 * The declined figure is kept as a snapshot so the same day is not proposed
 * again unless its attendance data actually changes (`D-22`). That is why the
 * reason matters: it is the only account of why this day was turned down.
 */
export function DeclineDialog({
  kind,
  candidate,
  userName,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [reason, setReason] = useState('');

  const noun = kind === 'CTO' ? 'CTO application' : 'PTO award';

  return (
    <OverrideDialogShell
      title={`Decline ${noun}`}
      description={`Turning down the ${noun} suggested for ${userName} on
        ${candidate.date}.`}
      engineLabel='The ladder proposed'
      engineValue={<ProposedByLadder candidate={candidate} />}
      submitLabel='Decline'
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({ reason: reason.trim(), version: candidate.version })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      reasonHelperText='The only account of why this day was turned down. It is kept with the decision.'
    >
      <Typography variant='body2' color='text.secondary'>
        Nothing is posted to the ledger, and no balance moves. The suggestion is
        not raised again for this day unless its attendance data changes.
      </Typography>
    </OverrideDialogShell>
  );
}

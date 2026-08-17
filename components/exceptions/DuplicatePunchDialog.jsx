'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';

/**
 * `P-07`, `FR-4.7`, `FR-4.12`. Keep or soft delete, so a flagged pair is never
 * double counted.
 *
 * **Keep** does not clear the engine's flag. `isDuplicate` is derived and
 * rewritten by every recalculation, so clearing it would last until the next
 * run — the decision is recorded beside it instead, and the punch stays out of
 * pairing exactly as the engine concluded. What changes is that the queue
 * stops asking.
 *
 * **Remove** soft deletes the punch. A wrong punch is fixed by editing it and
 * a real duplicate is removed; neither is ever cancelled by adding a second
 * punch (`FR-4.12`).
 */
export function DuplicatePunchDialog({
  punch,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [reason, setReason] = useState('');

  return (
    <OverrideDialogShell
      title='Resolve duplicate punch'
      description={`The engine flagged this ${punch.userName ? `punch for ${punch.userName}` : 'punch'} as
        a duplicate of another within the team's duplicate window, and left it
        out of the day's total rather than counting it twice.`}
      engineLabel='The engine flagged'
      engineValue={
        <Stack spacing={0.5}>
          <Typography variant='bodyStrong'>
            {punch.type} on {punch.date}
          </Typography>
          <Typography variant='mono' color='text.secondary'>
            Excluded from pairing
          </Typography>
        </Stack>
      }
      submitLabel='Keep it'
      open={open}
      onClose={onClose}
      onSubmit={() => onSubmit('keep', { reason: reason.trim() })}
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      reasonHelperText='Kept with the punch and readable on the audit log afterwards.'
    >
      <Typography variant='body2' color='text.secondary'>
        Keeping it records that this pair is genuinely two taps. The engine's
        own flag stays as it is — a recalculation would only put it back — so
        the punch remains out of the total and this queue stops asking.
      </Typography>

      <Button
        type='button'
        variant='outlined'
        color='error'
        disabled={pending || !reason.trim()}
        onClick={() =>
          onSubmit('remove', {
            reason: reason.trim(),
            version: punch.version,
          })
        }
      >
        Remove the punch
      </Button>
    </OverrideDialogShell>
  );
}

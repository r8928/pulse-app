'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';

/**
 * `P-05`, `FR-2.11`. Names the user, the change, and every record approval
 * would soft delete.
 *
 * Two decisions, one dialog, because they are answers to the same question:
 * **approve** soft deletes the records and reverses every balance movement
 * they caused; **reject** moves nothing, so `IT` can correct a wrong date or
 * restore a wrongly removed tenure and resubmit.
 *
 * Neither touches the user's own soft delete. That already happened, and their
 * access went with it — `FR-2.11` is explicit that it never waits for this.
 */
export function ReductionDialog({
  approval,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [reason, setReason] = useState('');

  const records = approval.records ?? [];
  const dates = [...new Set(records.map((record) => record.date))].sort();

  return (
    <OverrideDialogShell
      title='Employment-period reduction'
      description={`${approval.userName}'s employment period shrank, and these
        records now sit outside it. Approving soft deletes them and reverses
        every balance movement they caused.`}
      engineLabel='The change that caused this'
      engineValue={
        <Stack spacing={0.5}>
          <Typography variant='bodyStrong'>
            {approval.change?.description ?? approval.change?.kind}
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            {records.length} record{records.length === 1 ? '' : 's'} outside the
            period{dates.length > 0 ? `, ${dates[0]} to ${dates.at(-1)}` : ''}
          </Typography>
        </Stack>
      }
      submitLabel='Approve and soft delete'
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit('approve', {
          reason: reason.trim(),
          version: approval.version,
        })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      reasonHelperText='Kept with the decision, and readable on the audit log afterwards.'
    >
      <Stack spacing={1}>
        <Typography variant='metricLabel' color='text.secondary'>
          Dates affected
        </Typography>
        <Typography variant='mono'>
          {dates.length > 0 ? dates.join(', ') : 'None'}
        </Typography>
      </Stack>

      <Typography variant='body2' color='text.secondary'>
        No ledger entry is deleted or edited. Each one is cancelled by a
        reversing entry, and an office administrator may restore the whole set
        later — which reverses those reversals and returns the balance exactly.
      </Typography>

      <Button
        type='button'
        variant='outlined'
        disabled={pending || !reason.trim()}
        onClick={() =>
          onSubmit('reject', {
            reason: reason.trim(),
            version: approval.version,
          })
        }
      >
        Reject — the change itself is wrong
      </Button>
    </OverrideDialogShell>
  );
}

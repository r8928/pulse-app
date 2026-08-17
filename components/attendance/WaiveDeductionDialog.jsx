'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { effective } from '../../utils/dayRecord.js';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';

/**
 * P-25. BR-8: OFFICE_ADMIN may override a late arrival, which then counts as
 * compliant and waives the deduction. An OFFICE_ADMIN action under FR-6.10,
 * never a manager one.
 *
 * The deduction is overridden to 0 rather than removed. The engine's own
 * figure and the rule that produced it stay readable underneath, which is what
 * makes NFR-11 — "why is this number what it is" — answerable afterwards.
 */
export function WaiveDeductionDialog({
  record,
  userName,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [reason, setReason] = useState('');

  const deduction = effective(record, 'deduction') ?? 0;
  const rule = effective(record, 'deductionRule');
  const lateMinutes = effective(record, 'lateMinutes') ?? 0;

  return (
    <OverrideDialogShell
      title='Waive deduction'
      description={`Waiving the deduction the ladder raised for ${userName} on
        ${record.date}. The day then counts as compliant, and the engine's own
        figure stays visible beneath your decision.`}
      engineLabel='The ladder raised'
      engineValue={
        <Stack spacing={0.5}>
          <Typography variant='bodyStrong'>
            {deduction} day, {lateMinutes} late minutes
          </Typography>
          <Typography variant='mono' color='text.secondary'>
            {rule ?? 'No rule recorded'}
          </Typography>
        </Stack>
      }
      submitLabel='Waive deduction'
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          deduction: 0,
          reason: reason.trim(),
          version: record.version,
        })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
    >
      <Typography variant='body2' color='text.secondary'>
        Once waived the day counts as compliant and no leave is deducted for it.
        The ledger movement already posted is reversed rather than deleted, so
        the waiver stays visible on the balance history.
      </Typography>
    </OverrideDialogShell>
  );
}

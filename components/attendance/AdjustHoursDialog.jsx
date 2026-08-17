'use client';

import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { effective } from '../../utils/dayRecord.js';
import { formatDuration } from '../../utils/duration.js';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';

/**
 * P-24. FR-4.9 and FR-6.10: correcting the hours on a day when the punches
 * cannot be made right — a terminal that was down, a shift worked off site.
 *
 * Entered as hours and minutes rather than as a decimal, because that is what
 * the reader is checking against a clock.
 */
export function AdjustHoursDialog({
  record,
  userName,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const current = effective(record, 'workedMinutes') ?? 0;

  const [hours, setHours] = useState(String(Math.floor(current / 60)));
  const [minutes, setMinutes] = useState(String(current % 60));
  const [reason, setReason] = useState('');

  const total = Number(hours || 0) * 60 + Number(minutes || 0);

  return (
    <OverrideDialogShell
      title='Adjust hours'
      description={`Correcting the duration recorded for ${userName} on ${record.date}. The
        punches themselves are left alone — fix those with P-21 where they are
        the thing that is wrong.`}
      engineLabel='The engine computed'
      engineValue={
        <Typography variant='bodyStrong'>{formatDuration(current)}</Typography>
      }
      submitLabel='Save hours'
      canSubmit={Number.isFinite(total) && total >= 0}
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          workedMinutes: total,
          reason: reason.trim(),
          version: record.version,
        })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
    >
      <Stack direction='row' spacing={2}>
        <TextField
          label='Hours'
          type='number'
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0 } }}
        />
        <TextField
          label='Minutes'
          type='number'
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: 0, max: 59 },
          }}
        />
      </Stack>
    </OverrideDialogShell>
  );
}

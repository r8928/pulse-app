'use client';

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { format } from 'date-fns';
import { useState } from 'react';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';

/**
 * P-04, `FR-7.7`. For a user and date the engine raised no suggestion for at
 * all — created and approved in one action.
 *
 * `FR-7.6`: it carries `MANUAL_GRANT` as its rule rather than a `BR-` code,
 * so a reader who later asks which ladder row produced this credit gets an
 * honest answer — none did.
 */
export function OriginateDialog({
  kind,
  people,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [userId, setUserId] = useState(people[0]?._id ?? '');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const isCto = kind === 'CTO';

  return (
    <OverrideDialogShell
      title={isCto ? 'Apply CTO manually' : 'Grant PTO manually'}
      description={
        isCto
          ? `Applying CTO for a day the engine proposed nothing for. It spends
             PTO and cancels that day's deduction, exactly as an approved
             suggestion would.`
          : `Granting PTO for a day the engine proposed nothing for — extra work
             it had no attendance data to see.`
      }
      engineLabel='The ladder proposed'
      engineValue={
        <Typography variant='bodyStrong'>
          Nothing. This is recorded as a manual grant.
        </Typography>
      }
      submitLabel={isCto ? 'Apply CTO' : 'Grant PTO'}
      canSubmit={Boolean(userId) && Boolean(date) && amount !== ''}
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          userId,
          date,
          amount: Number(amount),
          reason: reason.trim(),
        })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      reasonHelperText='The only account of why this credit exists, since no ladder row produced it.'
    >
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
        label='Date worked'
        type='date'
        value={date}
        onChange={(event) => setDate(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        label='Amount'
        type='number'
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        helperText='In days.'
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 0.25 } }}
      />
    </OverrideDialogShell>
  );
}

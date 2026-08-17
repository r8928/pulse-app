'use client';

import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { OverrideDialogShell } from '../OverrideDialogShell.jsx';
import { ProposedByLadder } from './ProposedByLadder.jsx';

/**
 * P-01 and P-02. The moment anything reaches the ledger at all (`FR-7.1`).
 *
 * `FR-7.2`: the amount is unconstrained. The ladder row that proposed it stays
 * on screen, but the approver may enter any figure, including one no ladder
 * row produces — that is the point of a human decision, not a defect.
 *
 * `BR-26` applies only to CTO, which spends PTO rather than earning it. The
 * block is a live check at approval time (`D-23`), so the override here is an
 * intent the server acts on, never a client-side bypass: without it the
 * server refuses and this dialog stays open with the reason still typed.
 */
export function ApproveDialog({
  kind,
  candidate,
  userName,
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [amount, setAmount] = useState(String(candidate.proposedAmount));
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');

  const isCto = kind === 'CTO';

  return (
    <OverrideDialogShell
      title={isCto ? 'Approve CTO application' : 'Approve PTO award'}
      description={
        isCto
          ? `Applying CTO for ${userName} on ${candidate.date}. This spends PTO
             and cancels that day's automatic deduction in the same movement —
             both, or neither.`
          : `Approving the PTO ${userName} earned on ${candidate.date}. Nothing
             has reached the ledger until you do.`
      }
      engineLabel='The ladder proposed'
      engineValue={<ProposedByLadder candidate={candidate} />}
      submitLabel={isCto ? 'Apply CTO' : 'Approve'}
      canSubmit={amount !== '' && Number.isFinite(Number(amount))}
      open={open}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          amount: Number(amount),
          reason: reason.trim(),
          version: candidate.version,
          ...(isCto ? { override } : {}),
        })
      }
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      reasonHelperText='Stored on the award with your name and the time, and shown on every row that reads it.'
    >
      <TextField
        label='Amount to approve'
        type='number'
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        helperText='In days. It need not match the proposal, or any ladder row.'
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 0.25 } }}
      />

      {isCto ? (
        <FormControlLabel
          control={
            <Checkbox
              checked={override}
              onChange={(event) => setOverride(event.target.checked)}
            />
          }
          label='Override the insufficient PTO block'
        />
      ) : null}

      {isCto ? (
        <Typography variant='body2' color='text.secondary'>
          Without the override, an application worth more than the unexpired PTO
          available on that date is refused and nothing is posted.
        </Typography>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          Approving after the award's own expiry has passed extends it rather
          than letting it expire before anyone saw it, and the extension stays
          visible on the record.
        </Typography>
      )}
    </OverrideDialogShell>
  );
}

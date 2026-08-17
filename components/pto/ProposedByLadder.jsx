'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { dayLabel, ruleLabel } from '../../utils/candidateLabels.js';

/**
 * What the engine suggested, shown in every popup that decides on it.
 *
 * `FR-7.2`: the ladder decided what was PROPOSED, never what may be approved.
 * Keeping the proposal visible beside the editable figure is what makes the
 * difference between the two legible afterwards (NFR-11).
 */
export function ProposedByLadder({ candidate }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant='bodyStrong'>
        {dayLabel(candidate.proposedAmount)}
      </Typography>
      <Typography variant='mono' color='text.secondary'>
        {ruleLabel(candidate.rule)}
      </Typography>
    </Stack>
  );
}

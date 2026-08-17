'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from 'next/link';

/**
 * `P-06`, `FR-3.13`. Names the entity and the outstanding field, and **stays
 * queued until it is set**.
 *
 * Deliberately not an editor. The value belongs on `S-17` beside every other
 * setting for that team, and a second place to set it would be a second
 * source of truth for what a team is configured with. So this explains what
 * is missing and why the engine cannot proceed without it, and sends the
 * reader to the one screen that owns it.
 *
 * There is no dismiss, for the same reason `DC-6` forbids a default: the only
 * thing that clears this row is somebody setting the value.
 */
export function MissingConfigurationDialog({ gap, open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Required configuration not set</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          <DialogContentText>
            The engine will not guess this value or proceed without it, so this
            stays queued until it is set.
          </DialogContentText>

          <Paper variant='outlined' sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant='metricLabel' color='text.secondary'>
                {gap.entity}
              </Typography>
              <Typography variant='mono'>{gap.field}</Typography>
              <Typography variant='body2' color='text.secondary'>
                {gap.why}
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button type='button' onClick={onClose}>
          Close
        </Button>
        <Button
          component={Link}
          href={`/teams/${gap.teamId}`}
          variant='contained'
        >
          Set it on the team
        </Button>
      </DialogActions>
    </Dialog>
  );
}

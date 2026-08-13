'use client';

import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * P-44 and P-45. One audit record in full, or the whole history of one record.
 *
 * `before` and `after` are shown side by side as the complete documents they
 * are stored as (`FR-9.2`). A diff computed at write time cannot answer a
 * question nobody had thought to ask yet, which is why neither is a diff.
 *
 * Read only without exception (`FR-9.3`) — there is deliberately no control
 * here, because no application endpoint offers an edit or a delete.
 */
function StateColumn({ title, value }) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Stack spacing={1}>
        <Typography variant='metricLabel'>{title}</Typography>
        <Paper variant='outlined'>
          <Stack sx={{ p: 2, overflowX: 'auto' }}>
            <Typography component='pre' variant='mono' sx={{ margin: 0 }}>
              {value === null || value === undefined
                ? '—'
                : JSON.stringify(value, null, 2)}
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    </Grid>
  );
}

export function RecordHistoryDrawer({ open, onClose, title, records }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{title}</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          <Typography variant='body2' color='text.secondary'>
            Read only. Nothing on this screen can be edited or removed, because
            no endpoint in the application offers either.
          </Typography>

          {records.map((record) => (
            <Stack key={record._id} spacing={2}>
              <Stack
                direction='row'
                spacing={1}
                sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}
              >
                <Chip variant='statusInfo' label={record.action} />
                <Typography variant='mono' title={record.at}>
                  {record.at}
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  {record.actorName ?? 'System'} · {record.entityType}
                  {record.entityId ? ` ${record.entityId}` : ''}
                </Typography>
              </Stack>

              {record.reason ? (
                <Typography variant='body2'>
                  <Typography component='strong' variant='bodyStrong'>
                    Reason:
                  </Typography>{' '}
                  {record.reason}
                </Typography>
              ) : null}

              <Grid container spacing={2}>
                <StateColumn title='Before' value={record.before} />
                <StateColumn title='After' value={record.after} />
              </Grid>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

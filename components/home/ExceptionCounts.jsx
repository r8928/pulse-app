import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { QUEUE_ORDER, queueLabel } from '../../utils/queueLabels.js';

/**
 * `S-04`'s exception counts, for a viewer holding the exceptions permission.
 *
 * Only the queues with something waiting are shown. Twelve zero tiles would
 * bury the two that matter, and an empty queue is not news — so an entirely
 * clear system says so in one line instead.
 */
export function ExceptionCounts({ counts }) {
  const outstanding = QUEUE_ORDER.filter((queue) => (counts[queue] ?? 0) > 0);

  if (outstanding.length === 0) {
    return (
      <Alert severity='success'>
        Nothing outstanding anywhere. Every queue on the exceptions dashboard is
        clear.
      </Alert>
    );
  }

  return (
    <Grid container spacing={2}>
      {outstanding.map((queue) => (
        <Grid key={queue} size={{ xs: 12, sm: 6, md: 4 }}>
          <Card variant='outlined' sx={{ height: '100%' }}>
            {/* `href` rather than `component={Link}`: this renders inside a
                server component, and a function prop cannot cross into a
                client one. */}
            <CardActionArea
              href={`/exceptions?queue=${queue}`}
              sx={{ height: '100%', p: 2 }}
            >
              <Stack spacing={0.5}>
                <Typography variant='metricValue'>{counts[queue]}</Typography>
                <Typography variant='bodyStrong'>
                  {queueLabel(queue)}
                </Typography>
              </Stack>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

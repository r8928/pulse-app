import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from 'next/link';

/**
 * `S-04`'s own attendance and balance snapshot.
 *
 * The empty state is the part that matters: a colleague with no records yet
 * gets an explanatory line rather than zeroed statistics. "0 present days"
 * reads as *you were absent all year*, not as *we have nothing about you* —
 * and the two could hardly be further apart.
 */
function Metric({ label, value }) {
  return (
    <Grid size={{ xs: 6, sm: 4, md: 2 }}>
      <Stack spacing={0.5}>
        <Typography variant='metricValue'>{value}</Typography>
        <Typography variant='metricLabel' color='text.secondary'>
          {label}
        </Typography>
      </Stack>
    </Grid>
  );
}

export function OwnSnapshot({ attendance, balances, hasRecords, userId }) {
  return (
    <Paper variant='outlined'>
      <Stack spacing={2} sx={{ p: 3 }}>
        <Typography variant='sectionTitle'>Your year</Typography>

        {hasRecords ? (
          <Stack spacing={3}>
            <Grid container spacing={2}>
              <Metric label='Present' value={attendance.present} />
              <Metric label='Absent' value={attendance.absent} />
              <Metric label='Worked from home' value={attendance.wfh} />
              <Metric label='On leave' value={attendance.leave} />
              <Metric label='Late days' value={attendance.lateDays} />
              <Metric
                label='Holiday work'
                value={attendance.holidayWork ?? 0}
              />
            </Grid>

            <Stack spacing={1}>
              <Typography variant='metricLabel' color='text.secondary'>
                Balances
              </Typography>
              <Grid container spacing={2}>
                {balances.map((row) => (
                  <Metric
                    key={row.leaveType}
                    label={row.leaveType}
                    value={row.balance}
                  />
                ))}
              </Grid>
            </Stack>

            {userId ? (
              <Typography variant='body2'>
                <Link href={`/leave/${userId}/ledger`}>
                  See what produced each of these
                </Link>
              </Typography>
            ) : null}
          </Stack>
        ) : (
          <Alert severity='info'>
            Nothing recorded for you yet. Your present days, balances by type
            and PTO will appear here once attendance has been captured for a
            date inside your employment period.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

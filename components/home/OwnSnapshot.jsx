'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

/**
 * `S-04`'s own attendance and balance snapshot.
 *
 * The empty state is the part that matters: a colleague with no records yet
 * gets an explanatory line rather than zeroed statistics. "0 present days"
 * reads as *you were absent all year*, not as *we have nothing about you* —
 * and the two could hardly be further apart.
 *
 * **Balance history is one click from here, three ways.** A button in the
 * header, every balance figure, and the empty state — because `NFR-11` asks
 * "why is this number what it is" and `S-14` is the only screen that answers.
 * An attendance figure gets no link: those are counted from day records rather
 * than replayed from the ledger, so a trace would lead somewhere with nothing
 * to say about them.
 */
const ledgerHref = (userId, leaveType) =>
  leaveType
    ? `/leave/${userId}/ledger?leaveType=${encodeURIComponent(leaveType)}`
    : `/leave/${userId}/ledger`;

/**
 * One figure with its caption. `href` makes the figure itself the link, which
 * is why the whole pair sits inside the anchor — a reader aiming at a number
 * should not have to hit the word underneath it instead.
 */
function Metric({ label, value, href }) {
  const figure = (
    <Stack spacing={0.5}>
      <Typography variant='metricValue'>{value}</Typography>
      <Typography variant='metricLabel' color='text.secondary'>
        {label}
      </Typography>
    </Stack>
  );

  return (
    <Grid size={{ xs: 6, sm: 4, md: 2 }}>
      {href ? (
        <Link
          component={NextLink}
          href={href}
          underline='hover'
          color='inherit'
        >
          {figure}
        </Link>
      ) : (
        figure
      )}
    </Grid>
  );
}

export function OwnSnapshot({ attendance, balances, hasRecords, userId }) {
  return (
    <Paper variant='outlined'>
      <Stack spacing={2} sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Typography variant='sectionTitle'>Your year so far</Typography>

          {userId ? (
            <Button
              component={NextLink}
              href={ledgerHref(userId)}
              variant='contained'
            >
              Balance history
            </Button>
          ) : null}
        </Stack>

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
                Leave left, by type
              </Typography>
              <Grid container spacing={2}>
                {balances.map((row) => (
                  <Metric
                    key={row.leaveType}
                    label={row.leaveType}
                    value={row.balance}
                    href={userId ? ledgerHref(userId, row.leaveType) : null}
                  />
                ))}
              </Grid>
            </Stack>

            <Typography variant='body2' color='text.secondary'>
              Every figure above is worked out from your records each time it is
              shown, never stored. Open a balance to read the entries behind it.
            </Typography>
          </Stack>
        ) : (
          <Alert severity='info'>
            Nothing has been recorded for you yet. Once your attendance is
            captured for a date inside your employment period, this is where
            your present, absent and late days appear, along with how much leave
            of each type you have left. Nothing is needed from you — attendance
            arrives from the door machine or from an administrator.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { endOfYear, format, startOfYear } from 'date-fns';
import { ExceptionCounts } from '../../components/home/ExceptionCounts.jsx';
import { OwnSnapshot } from '../../components/home/OwnSnapshot.jsx';
import { visibleNavigation } from '../../components/navigation.js';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../constants/index.js';
import { summariseAttendance, summariseBalances } from '../../database.js';
import { countExceptionQueues } from '../../engine/exceptions.js';
import { getSessionUser } from '../../session.js';

/**
 * S-04. The landing page for every role.
 *
 * Tiles render per permission: a viewer holding only attendance read sees the
 * snapshot and nothing else. The set comes from the same `visibleNavigation`
 * the shell uses, so the two can never disagree about what a viewer reaches.
 *
 * `NFR-1`: each section is read independently and a failure in one is caught
 * where it happens, so one failing count does not blank the page.
 */
async function orNull(read) {
  try {
    return await read();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const user = await getSessionUser();
  const tiles = visibleNavigation(user.permissions).filter(
    (item) => item.route !== '/',
  );

  const now = new Date();
  const range = {
    from: format(startOfYear(now), 'yyyy-MM-dd'),
    to: format(endOfYear(now), 'yyyy-MM-dd'),
  };

  const [attendance, balances, counts] = await Promise.all([
    orNull(() => summariseAttendance({ userIds: [user.userId], ...range })),
    orNull(() => summariseBalances({ userIds: [user.userId], ...range })),
    user.permissions[PERMISSIONS.EXCEPTIONS_READ]
      ? orNull(() => countExceptionQueues(range))
      : null,
  ]);

  const mine = attendance?.rows?.[0] ?? null;
  const myBalances = balances?.rows ?? [];

  return (
    <Stack spacing={3}>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description='Your attendance and balances at a glance, and the modules your permissions reach.'
      />

      <OwnSnapshot
        userId={user.userId}
        attendance={
          mine ?? { present: 0, absent: 0, wfh: 0, leave: 0, lateDays: 0 }
        }
        balances={myBalances.map((row) => ({
          leaveType: row.leaveType,
          balance: row.balance,
        }))}
        hasRecords={
          Boolean(mine) && myBalances.length + (mine?.present ?? 0) > 0
        }
      />

      {counts ? (
        <Stack spacing={2}>
          <Typography variant='sectionTitle'>Needing attention</Typography>
          <ExceptionCounts counts={counts} />
        </Stack>
      ) : null}

      <Stack spacing={2}>
        <Typography variant='sectionTitle'>Modules</Typography>
        {tiles.length === 0 ? (
          <Alert severity='info'>
            Your role currently reaches no other modules. An office
            administrator can widen that on the access control matrix.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {tiles.map((tile) => (
              <Grid key={tile.route} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant='outlined' sx={{ height: '100%' }}>
                  {/* `href` rather than `component={Link}`: this is a server
                      component, and a function prop cannot cross into a
                      client component. */}
                  <CardActionArea
                    href={tile.route}
                    sx={{ height: '100%', p: 2 }}
                  >
                    <Stack spacing={1}>
                      <Typography variant='bodyStrong'>{tile.label}</Typography>
                      <Typography variant='body2' color='text.secondary'>
                        {tile.route}
                      </Typography>
                    </Stack>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>
    </Stack>
  );
}

import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { visibleNavigation } from '../../components/navigation.js';
import { PageHeader } from '../../components/PageHeader.jsx';
import { getSessionUser } from '../../session.js';

/**
 * S-04. The landing page for every role.
 *
 * Tiles render per permission: a viewer holding only attendance read sees the
 * snapshot and nothing else. The set comes from the same `visibleNavigation`
 * the shell uses, so the two can never disagree about what a viewer reaches.
 */
export default async function HomePage() {
  const user = await getSessionUser();
  const tiles = visibleNavigation(user.permissions).filter(
    (item) => item.route !== '/',
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description='Your attendance and balances at a glance, and the modules your permissions reach.'
      />

      <Paper variant='outlined'>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Typography variant='sectionTitle'>Your snapshot</Typography>
          {/* An empty state that explains itself rather than showing zeroes,
              which would read as "you were absent all year". */}
          <Alert severity='info'>
            Attendance capture is not built yet, so there are no day records to
            summarise. This will show your present days, leave balances by type
            and PTO once the engine ships.
          </Alert>
        </Stack>
      </Paper>

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

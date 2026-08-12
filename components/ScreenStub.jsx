import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

/**
 * A screen that is routed, permission-gated and laid out, but not yet
 * implemented.
 *
 * This is deliberately more than a heading. It renders the tabs, columns and
 * filters `list-of-screens.md` documents for the screen, so the navigation
 * model and the permission gate are proven across all 22 screens now, and each
 * remaining screen becomes a fill-in job rather than a from-scratch one.
 *
 * It states plainly that it is not implemented. A skeleton that looked
 * finished but returned nothing would read as a bug.
 */
export function ScreenStub({
  screenId,
  specRefs = [],
  tabs = [],
  columns = [],
  filters = [],
}) {
  return (
    <Stack spacing={3}>
      <Alert severity='info' icon={<ConstructionOutlined fontSize='small' />}>
        <AlertTitle>Not yet implemented</AlertTitle>
        This screen is routed and permission-gated, and the structure below is
        what {screenId} is specified to hold. The behaviour is not built yet.
      </Alert>

      {specRefs.length > 0 ? (
        <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Typography variant='metricLabel'>Satisfies</Typography>
          {specRefs.map((ref) => (
            <Chip key={ref} label={ref} variant='statusNeutral' />
          ))}
        </Stack>
      ) : null}

      {tabs.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant='metricLabel'>Tabs</Typography>
          <Stack direction='row' sx={{ flexWrap: 'wrap', gap: 1 }}>
            {tabs.map((tab) => (
              <Chip key={tab} label={tab} variant='statusNeutral' />
            ))}
          </Stack>
        </Stack>
      ) : null}

      {filters.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant='metricLabel'>Filters</Typography>
          <Stack direction='row' sx={{ flexWrap: 'wrap', gap: 1 }}>
            {filters.map((filter) => (
              <Chip key={filter} label={filter} variant='statusNeutral' />
            ))}
          </Stack>
        </Stack>
      ) : null}

      {columns.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant='metricLabel'>Columns</Typography>
          <Paper variant='outlined'>
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column}>{column}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={columns.length}>
                    <Typography variant='body2' color='text.secondary'>
                      No data — this screen is not implemented yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        </Stack>
      ) : null}
    </Stack>
  );
}

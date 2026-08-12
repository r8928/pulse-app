import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * An empty result says why it is empty and what to do about it.
 *
 * The spec is specific about this: a new user with no records sees an
 * explanatory line rather than zeroed statistics; an empty exception tab reads
 * "Nothing outstanding" rather than showing an empty grid; a range with no
 * records says so. A blank table is indistinguishable from a broken one.
 */
export function EmptyState({ icon, title, description, action }) {
  return (
    <Paper variant='outlined'>
      <Stack
        spacing={2}
        sx={{ alignItems: 'center', textAlign: 'center', p: 6 }}
      >
        {icon ? <Stack sx={{ color: 'text.secondary' }}>{icon}</Stack> : null}
        <Typography variant='sectionTitle'>{title}</Typography>
        {description ? (
          <Typography
            variant='body2'
            color='text.secondary'
            sx={{ maxWidth: 460 }}
          >
            {description}
          </Typography>
        ) : null}
        {action}
      </Stack>
    </Paper>
  );
}

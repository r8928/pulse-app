import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Every screen states what it is and, where the numbers need it, what they
 * mean (NFR-2). The description is not decorative — it is where an
 * abbreviation or a counting rule gets explained.
 */
export function PageHeader({ title, description, actions, meta }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
    >
      <Stack spacing={1}>
        <Typography variant='pageTitle'>{title}</Typography>
        {description ? (
          <Typography variant='body2' color='text.secondary'>
            {description}
          </Typography>
        ) : null}
        {meta}
      </Stack>
      {actions ? (
        <Stack direction='row' spacing={1}>
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}

import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { EmptyState } from '../components/EmptyState.jsx';

/**
 * S-03. An unknown route, or a record the viewer's scope does not reach.
 *
 * The second case is deliberate: an out-of-scope record resolves here rather
 * than to S-02, because answering "forbidden" would confirm the record exists
 * to someone not permitted to know that.
 */
export default function NotFound() {
  return (
    <Stack sx={{ minHeight: '100vh', justifyContent: 'center', p: 3 }}>
      <EmptyState
        icon={<SearchOffOutlined fontSize='large' />}
        title='Not found'
        description='This page does not exist, or the record is outside what your role can reach.'
        action={
          // `href` rather than `component={Link}`: this is a server component,
          // and a function prop cannot cross into a client component.
          <Button href='/' variant='outlined'>
            Back to home
          </Button>
        }
      />
    </Stack>
  );
}

import LockOutlined from '@mui/icons-material/LockOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { EmptyState } from '../../components/EmptyState.jsx';

/**
 * S-02. Names the permission the viewer lacks, so a narrowed scope is
 * diagnosable rather than mysterious.
 *
 * A record that exists but sits outside the viewer's scope does NOT arrive
 * here — it resolves to 404, so its existence is not leaked (S-03).
 */
export default async function AccessDeniedPage({ searchParams }) {
  const params = await searchParams;
  const permission = params?.permission;

  return (
    <Stack sx={{ minHeight: '100vh', justifyContent: 'center', p: 3 }}>
      <EmptyState
        icon={<LockOutlined fontSize='large' />}
        title='You do not have access to this screen'
        description={
          permission
            ? `It requires the ${permission} permission, which your role does not currently hold. An office administrator can grant it on the access control matrix.`
            : 'Your role does not hold the permission this screen requires. An office administrator can grant it on the access control matrix.'
        }
        action={
          <Button href='/' variant='outlined'>
            Back to home
          </Button>
        }
      />
    </Stack>
  );
}

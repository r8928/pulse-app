import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../components/ScreenStub.jsx';
import { ROLES } from '../../../../constants/index.js';

export default function AccessControlPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Access control'
        description='Every permission the system defines, against every role, with the scope each holds it at. A change here takes effect on the next request, with no redeploy and no restart.'
      />
      <Alert severity='info'>
        The OFFICE_ADMIN column is locked at ALL throughout. Any edit that would
        remove a permission from it or narrow its scope is rejected, and the
        four roles are the complete set — there is no way to add a fifth.
      </Alert>
      <ScreenStub
        screenId='S-19'
        specRefs={['FR-1.2', 'FR-1.3', 'FR-1.4', 'FR-6.7', 'DC-2']}
        columns={['Permission', ...Object.values(ROLES)]}
      />
    </Stack>
  );
}

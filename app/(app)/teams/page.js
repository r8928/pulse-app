import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function TeamsPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Teams'
        description='Every team, with its manager and member count. A soft-deleted team stays readable so past day records still resolve through the calendar and policy it held, but is no longer offered for assignment.'
      />
      <ScreenStub
        screenId='S-16'
        specRefs={['FR-3.1', 'FR-3.2']}
        columns={['Team', 'Manager', 'Members', 'Default shift', 'Status']}
      />
    </Stack>
  );
}

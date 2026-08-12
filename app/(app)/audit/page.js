import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function AuditPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Audit log'
        description='Every change ever made, append only and retained indefinitely. Read only without exception — this screen offers no edit or delete because no application endpoint provides one. Covers every authentication event, successful or failed.'
      />
      <ScreenStub
        screenId='S-22'
        specRefs={['FR-1.6', 'FR-9.1', 'FR-9.2', 'FR-9.3', 'NFR-9', 'DC-3']}
        filters={['Actor', 'Action', 'Entity type', 'Date range']}
        columns={[
          'Time',
          'Actor',
          'Action',
          'Entity type',
          'Identifier',
          'Reason',
        ]}
      />
    </Stack>
  );
}

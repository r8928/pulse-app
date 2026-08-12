import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function PtoPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='PTO awards and CTO applications'
        description='One earned balance, two ways to spend it. Nothing posts to the ledger until approved. A decline posts nothing, states its reason, and is not re-proposed unless that day attendance data changes. An award approved after its expiry posts with the expiry extended, visibly.'
      />
      <ScreenStub
        screenId='S-15'
        specRefs={[
          'FR-7.1',
          'FR-7.2',
          'FR-7.3',
          'FR-7.5',
          'FR-7.7',
          'FR-7.8',
          'BR-18',
          'BR-26',
        ]}
        filters={['Status', 'Team', 'Employee', 'Date range']}
        columns={[
          'Employee',
          'Date worked',
          'Proposed',
          'Approved',
          'Rule or manual grant',
          'Expiry',
          'Extended',
          'Status',
          'Actor',
          'Reason',
        ]}
      />
    </Stack>
  );
}

import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function ExceptionsPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Exceptions'
        description='The single work queue. Every unresolved item in the system surfaces here and nowhere else, with approve, approve with a changed amount, and decline on each row where those apply.'
      />
      <ScreenStub
        screenId='S-05'
        specRefs={['FR-8.6', 'NFR-1', 'NFR-3']}
        tabs={[
          'Missing check in or check out',
          'Duplicate punch',
          'Impossible duration',
          'Date with no shift assigned',
          'Required configuration value not set',
          'Unmatched import row',
          'Unresolved late arrival',
          'Exhausted leave or PTO balance',
          'PTO award approaching expiry',
          'PTO awaiting approval',
          'CTO awaiting approval',
          'Employment-period reduction awaiting approval',
        ]}
      />
    </Stack>
  );
}

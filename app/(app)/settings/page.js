import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function SettingsPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Company configuration'
        description='Settings that are not per team. Everything per-team lives on that team configuration screen instead.'
      />
      {/* FR-3.10 and DC-5: worth stating on the screen, because its absence
          looks like an omission rather than a decision. */}
      <Alert severity='info'>
        There is deliberately no company-wide default timezone and none can be
        set here. Every timestamp resolves through the timezone of the shift
        that applies to that user on that date.
      </Alert>
      <ScreenStub
        screenId='S-18'
        specRefs={['FR-2.6', 'FR-1.5', 'FR-6.4']}
        tabs={['Employment types', 'Authorised Google Workspace domains']}
      />
    </Stack>
  );
}

import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../components/ScreenStub.jsx';

export default function RosterImportPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Roster import'
        description='One-time go-live migration from the old workbook Biometric ID sheet. Imports people, not attendance — historical attendance is deliberately not migrated. Nothing is guessed or defaulted; the commit stays disabled until every outstanding field is filled.'
      />
      <ScreenStub
        screenId='S-08'
        specRefs={['FR-2.9', 'FR-2.6', 'FR-3.4', 'DC-6']}
        tabs={['1. Upload', '2. Complete missing details', '3. Commit']}
        columns={[
          'Employee code',
          'Full name',
          'Work email',
          'Team',
          'Employment type',
          'Tracked',
          'Login enabled',
          'Date of joining',
          'Shift',
        ]}
      />
    </Stack>
  );
}

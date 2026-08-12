import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../components/ScreenStub.jsx';

export default function AttendanceImportPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Attendance import'
        description='Bulk load punches from the biometric Excel export. The date format is confirmed before validation runs, every rejection carries a stated reason, and the commit is atomic — every accepted row is written or none is.'
      />
      <ScreenStub
        screenId='S-11'
        specRefs={['FR-4.2', 'FR-4.3', 'FR-4.4', 'FR-4.5', 'FR-4.11', 'NFR-4']}
        tabs={[
          '1. Upload',
          '2. Confirm date format',
          '3. Preview accepted and rejected',
          '4. Commit',
        ]}
        columns={[
          'Sr No.',
          'Employee Code',
          'Employee Name',
          'Type',
          'Date',
          'Time',
          'Accepted',
          'Reason for rejection',
        ]}
      />
    </Stack>
  );
}

import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../components/ScreenStub.jsx';

export default function AttendanceEntryPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Daily attendance'
        description='Enter and correct attendance for one team on one date. Built so a single day correction takes three clicks or fewer from home. Untracked users do not appear here — they receive no day records.'
      />
      <ScreenStub
        screenId='S-10'
        specRefs={['FR-4.1', 'FR-4.9', 'FR-5.1', 'FR-5.2', 'NFR-1']}
        filters={['Team', 'Date']}
        columns={[
          'Employee',
          'Punches',
          'Worked duration',
          'Day type',
          'Day status',
          'Late minutes',
          'Deduction and rule',
          'Override',
        ]}
      />
    </Stack>
  );
}

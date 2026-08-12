import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function AttendanceOverviewPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Attendance'
        description='Attendance statistics for every employee over a chosen date range. Untracked users are excluded from every total and the exclusion is stated rather than left silent. A user who is no longer active keeps unchanged figures inside their employment period.'
      />
      <ScreenStub
        screenId='S-09'
        specRefs={['FR-8.1', 'FR-2.4', 'FR-2.10', 'FR-5.6', 'FR-5.7', 'NFR-3']}
        filters={[
          'Date range',
          'Team',
          'Employee',
          'Just me',
          'Include soft-deleted users',
        ]}
        columns={[
          'Employee',
          'Present',
          'Absent',
          'Leave by type',
          'WFH used',
          'Late days',
          'Short days',
          'Holiday-work days',
          'PTO balance',
        ]}
      />
    </Stack>
  );
}

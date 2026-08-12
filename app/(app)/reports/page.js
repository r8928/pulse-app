import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function ReportsPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Report builder'
        description='An attendance report for any date range, not only a calendar month. Working-day and holiday counts derive from the calendar of the team the user held on each date, not their current team. Untracked users are excluded and the exclusion is stated.'
      />
      <ScreenStub
        screenId='S-20'
        specRefs={['FR-8.3', 'FR-3.9', 'FR-2.4', 'FR-2.10', 'NFR-3']}
        filters={[
          'Date range',
          'Team',
          'User',
          'Single tenure or whole employment period',
        ]}
        columns={[
          'Employee',
          'Working days',
          'Holidays',
          'Present',
          'Absent',
          'Leave by type',
          'WFH',
          'Late',
          'Short days',
          'Holiday work',
          'PTO',
        ]}
      />
    </Stack>
  );
}

import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../components/ScreenStub.jsx';

export default function AnnualSummaryPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Annual summary'
        description='One user year, aggregating every month. A month with no data renders as an explicit zero row and is never silently omitted — this was workbook defect F1. Months outside the employment period are marked as such rather than shown as absence.'
      />
      <ScreenStub
        screenId='S-21'
        specRefs={['FR-8.4', 'FR-6.5', 'FR-3.9', 'FR-8.1']}
        filters={['Year', 'Employee']}
        columns={[
          'Month',
          'Working days',
          'Present',
          'Absent',
          'Leave',
          'WFH',
          'Late',
          'PTO',
          'In employment period',
        ]}
      />
    </Stack>
  );
}

import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../../components/ScreenStub.jsx';

export default async function DayRecordPage({ params }) {
  const { userId, date } = await params;

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Day record'
        description={`Everything the engine concluded about user ${userId} on ${date}, and why. Each override sits beside the engine's value with who, why and when; a recalculation refreshes the engine's value and leaves the override standing.`}
      />
      <ScreenStub
        screenId='S-12'
        specRefs={[
          'FR-3.5',
          'FR-5.1',
          'FR-5.2',
          'FR-5.3',
          'FR-5.8',
          'FR-5.9',
          'FR-6.11',
          'FR-6.12',
          'FR-7.6',
          'NFR-11',
        ]}
        tabs={['Punches', 'Computed', 'Deduction', 'Overrides']}
        columns={[
          'Instant',
          'Type',
          'Source',
          'Work date',
          'Duplicate',
          'Engine value',
          'Override',
        ]}
      />
    </Stack>
  );
}

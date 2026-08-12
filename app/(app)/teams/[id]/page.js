import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../components/ScreenStub.jsx';

export default async function TeamConfigurationPage({ params }) {
  const { id } = await params;

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Team configuration'
        description={`Team ${id}: its complete policy. Every value here is data, editable at runtime with no redeploy, and every seeded figure is only a seed. Two teams configured differently produce different results for the same period.`}
      />
      <ScreenStub
        screenId='S-17'
        specRefs={[
          'FR-3.3',
          'FR-3.4',
          'FR-3.7',
          'FR-3.8',
          'FR-6.4',
          'BR-1',
          'BR-27',
        ]}
        tabs={[
          'Members',
          'Shifts',
          'Holiday calendar',
          'Weekly off',
          'Leave policy',
          'Ladders',
          'Thresholds & windows',
        ]}
      />
    </Stack>
  );
}

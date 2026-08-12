import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../../../components/ScreenStub.jsx';

export default async function LedgerPage({ params }) {
  const { userId } = await params;

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Ledger and balance trace'
        description={`Every immutable balance movement for user ${userId}, in order, with the rule that produced it. Read only by design: nothing here can be edited or deleted, and a movement is cancelled only by a reversing entry appended elsewhere.`}
      />
      <ScreenStub
        screenId='S-14'
        specRefs={['FR-6.6', 'FR-6.8', 'FR-7.6', 'NFR-11', 'DC-4']}
        columns={[
          'Date',
          'Type',
          'Amount',
          'Running balance',
          'Rule or manual grant',
          'Actor',
          'Reason',
          'Reversal',
        ]}
      />
    </Stack>
  );
}

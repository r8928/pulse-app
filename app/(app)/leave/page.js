import Stack from '@mui/material/Stack';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { ScreenStub } from '../../../components/ScreenStub.jsx';

export default function LeaveBalancesPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Leave & balances'
        description='Typed leave balances per user, per month and per year. Every figure is replayed from the ledger and never stored, so every number links to the entries that produced it. Paternity and maternity post to their own typed balance and never touch the standard one.'
      />
      <ScreenStub
        screenId='S-13'
        specRefs={[
          'FR-6.2',
          'FR-6.5',
          'FR-6.8',
          'FR-6.9',
          'FR-5.5',
          'BR-12',
          'BR-14',
        ]}
        filters={['Date range', 'Team', 'Employee', 'Just me']}
        columns={[
          'Employee',
          'Leave type',
          'Opening',
          'Credited',
          'Availed',
          'Automatic deductions',
          'CTO applied',
          'Balance',
          'WFH quota',
          'WFH balance',
        ]}
      />
    </Stack>
  );
}

import Stack from '@mui/material/Stack';
import { notFound } from 'next/navigation';
import { LedgerTrace } from '../../../../../components/leave/LedgerTrace.jsx';
import { PageHeader } from '../../../../../components/PageHeader.jsx';
import { LEDGER_ENTRY_TYPE } from '../../../../../constants/index.js';
import {
  getTeamPolicy,
  getUserById,
  listLedgerEntriesForUser,
} from '../../../../../database.js';

/**
 * S-14. The proof behind every number the app displays (NFR-11, MVP
 * criterion 11).
 *
 * The running balance is computed here, in the same order the entries were
 * read, so the figure a reader checks cannot disagree with the trace above it.
 */
export default async function LedgerPage({ params, searchParams }) {
  const { userId } = await params;
  const query = await searchParams;

  const user = await getUserById(userId);
  if (!user) notFound();

  const leaveType = query?.leaveType ?? '';

  const entries = await listLedgerEntriesForUser(userId, {
    leaveType: leaveType || null,
  });

  let running = 0;
  const withRunning = entries.map((entry) => {
    running += entry.amount;

    return {
      _id: String(entry._id),
      date: entry.date,
      entryType: entry.entryType,
      leaveType: entry.leaveType,
      amount: entry.amount,
      rule: entry.rule,
      actorName: entry.actorName,
      reason: entry.reason,
      reversalOf: entry.reversalOf ? String(entry.reversalOf) : null,
      runningBalance: Math.round(running * 100) / 100,
    };
  });

  const policy = user.teamId ? await getTeamPolicy(user.teamId) : null;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={`${user.fullName} — balance history`}
        description='Every movement, in order, with the rule that produced it. Read only: a movement is cancelled by appending its reverse, never by editing or deleting the original.'
      />

      <LedgerTrace
        user={{ _id: String(user._id), fullName: user.fullName }}
        entries={withRunning}
        hasOpeningBalance={entries.some(
          (entry) => entry.entryType === LEDGER_ENTRY_TYPE.OPENING_BALANCE,
        )}
        leaveTypes={(policy?.leaveTypes ?? []).map((type) => type.name)}
        filters={{ leaveType }}
      />
    </Stack>
  );
}

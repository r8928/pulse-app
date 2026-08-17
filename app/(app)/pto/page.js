import Stack from '@mui/material/Stack';
import { endOfYear, format, startOfYear } from 'date-fns';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { PtoCandidates } from '../../../components/pto/PtoCandidates.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  listCtoApplications,
  listPtoAwards,
  listTeams,
  listTrackedUserIds,
  listUsers,
} from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-15. One earned balance (PTO), two ways to spend it — and a human decides
 * every one of them.
 *
 * Range and team narrow the query here; status filters what the client
 * already holds, so the screen can tell "nothing was ever raised" apart from
 * "everything raised has been decided" (`S-15`'s two empty states).
 *
 * `today` is resolved on the server and passed down: expiry is a comparison
 * against a date, and a client reading its own clock would disagree with the
 * ledger across a timezone.
 */
export default async function PtoPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const now = new Date();
  const filters = {
    from: params?.from ?? format(startOfYear(now), 'yyyy-MM-dd'),
    to: params?.to ?? format(endOfYear(now), 'yyyy-MM-dd'),
    teamId: params?.teamId ?? '',
    userId: params?.userId ?? '',
  };

  const userIds = filters.userId
    ? [filters.userId]
    : await listTrackedUserIds({ teamId: filters.teamId || null });

  const query = { userIds, from: filters.from, to: filters.to };
  const [awards, applications, teams, roster] = await Promise.all([
    listPtoAwards(query),
    listCtoApplications(query),
    listTeams({ includeDeleted: false }),
    listUsers({ includeDeleted: false, pageSize: 500 }),
  ]);

  const byId = new Map(
    roster.items.map((person) => [String(person._id), person]),
  );

  /**
   * A candidate outlives the roster row it names — a colleague who has left
   * still has awards on the record (`FR-2.4`) — so an unresolved name is
   * stated rather than dropping the row.
   */
  const named = (item) => {
    const person = byId.get(item.userId);
    return {
      ...item,
      _id: String(item._id),
      fullName: person?.fullName ?? 'No longer on the roster',
      employeeCode: person?.employeeCode ?? '—',
    };
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title='PTO awards and CTO applications'
        description='One earned balance, two ways to spend it. Nothing posts to the ledger until approved. A decline posts nothing, states its reason, and is not re-proposed unless that day attendance data changes. An award approved after its expiry posts with the expiry extended, visibly.'
      />

      <PtoCandidates
        awards={awards.map(named)}
        applications={applications.map(named)}
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        people={roster.items.map((person) => ({
          _id: String(person._id),
          fullName: person.fullName,
        }))}
        filters={filters}
        canApprove={Boolean(viewer?.permissions[PERMISSIONS.PTO_APPROVE])}
        today={format(now, 'yyyy-MM-dd')}
      />
    </Stack>
  );
}

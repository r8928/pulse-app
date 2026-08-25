import Stack from '@mui/material/Stack';
import { rosterFiltersFor } from '../../../authz/rosterScope.js';
import { LeavePersonPicker } from '../../../components/leave/LeavePersonPicker.jsx';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import { getTeamPolicy, listTeams, listUsers } from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * Page 3's front door: choose a colleague, read their balance history (`S-14`).
 *
 * The balances that used to live here are now page 1, one row per colleague
 * beside the attendance they explain. What is left is the choosing, and only
 * a viewer whose `leave.read` reaches further than themselves has a choice to
 * make — `proxy.js` sends everyone else straight to their own history, because
 * a list of one person exists only to be clicked through.
 */
export default async function LeaveIndexPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const scoped = rosterFiltersFor(
    viewer.permissions[PERMISSIONS.LEAVE_READ],
    viewer,
    { teamId: params?.teamId },
  );

  const [teams, roster] = await Promise.all([
    listTeams({ includeDeleted: false, pageSize: 200 }),
    listUsers({
      includeDeleted: true,
      pageSize: 500,
      teamId: scoped.teamId ?? undefined,
    }),
  ]);

  /**
   * The types the opening-balance dialog offers. A team's own list where one
   * is chosen, since FR-6.4 makes it per-policy; nothing to offer otherwise,
   * which is DC-6 rather than a broken screen — the dialog says so.
   */
  const policy = scoped.teamId ? await getTeamPolicy(scoped.teamId) : null;

  const teamNames = new Map(
    teams.items.map((team) => [String(team._id), team.name]),
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Leaves & balances'
        description='Every movement behind every balance, per colleague. Figures are replayed from the ledger and never stored, so a balance can always name the entries that produced it.'
      />

      <LeavePersonPicker
        people={roster.items.map((person) => ({
          _id: String(person._id),
          fullName: person.fullName,
          employeeCode: person.employeeCode,
          teamName: teamNames.get(person.teamId) ?? null,
          noLongerActive: Boolean(person.deletedAt),
        }))}
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        filters={{ teamId: scoped.teamId ?? params?.teamId ?? '' }}
        leaveTypes={policy?.leaveTypes ?? []}
        canWrite={Boolean(viewer.permissions[PERMISSIONS.LEAVE_WRITE])}
      />
    </Stack>
  );
}

import { TeamRoster } from '../../../components/TeamRoster.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import { listTeams, listUsers } from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-16. Server component: it reads the session and the data and hands both
 * down as props.
 *
 * A soft-deleted team is included so the roster can mark it as no longer
 * offered for assignment rather than silently dropping it (`FR-3.2`).
 */
export default async function TeamsPage() {
  const [viewer, teams, users] = await Promise.all([
    getSessionUser(),
    listTeams({ includeDeleted: true }),
    // FR-2.4: only a serving colleague may be named as a manager.
    listUsers({ includeDeleted: false, pageSize: 1000 }),
  ]);

  return (
    <TeamRoster
      teams={teams.items.map((team) => ({
        _id: String(team._id),
        name: team.name,
        managerId: team.managerId ?? null,
        managerName: team.managerName ?? null,
        defaultShiftName: team.defaultShiftName ?? null,
        memberCount: team.memberCount,
        deletedAt: team.deletedAt ? team.deletedAt.toISOString() : null,
        version: team.version,
      }))}
      users={users.items.map((user) => ({
        _id: String(user._id),
        fullName: user.fullName,
      }))}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.TEAM_WRITE])}
    />
  );
}

import { notFound } from 'next/navigation';
import { UserDetail } from '../../../../components/UserDetail.jsx';
import { PERMISSIONS } from '../../../../constants/index.js';
import {
  getRecordHistory,
  getUserById,
  listShiftAssignments,
  listShifts,
  listTeamAssignments,
  listTeams,
  listUsers,
} from '../../../../database.js';
import { getSessionUser } from '../../../../session.js';

/**
 * S-07. A user the viewer's scope does not reach resolves to 404 rather than
 * 403, so its existence is not leaked (S-03).
 */
export default async function UserDetailPage({ params }) {
  const { id } = await params;

  const [viewer, user] = await Promise.all([getSessionUser(), getUserById(id)]);

  if (!user) notFound();

  const [history, teams, shiftAssignments, teamAssignments, colleagues] =
    await Promise.all([
      getRecordHistory('user', id),
      listTeams({ includeDeleted: true }),
      listShiftAssignments(id),
      listTeamAssignments(id),
      // FR-2.4: only a serving colleague may be named as a replacement manager.
      listUsers({ includeDeleted: false, pageSize: 1000 }),
    ]);

  // FR-3.3: shifts are per team, so the picker offers this user's team's.
  const shifts = user.teamId ? (await listShifts(user.teamId)).items : [];

  return (
    <UserDetail
      user={{
        ...user,
        _id: String(user._id),
        deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
        tenures: user.tenures.map((tenure) => ({
          ...tenure,
          _id: String(tenure._id),
          deletedAt: tenure.deletedAt ? tenure.deletedAt.toISOString() : null,
          createdAt: null,
          updatedAt: null,
        })),
        createdAt: null,
        updatedAt: null,
      }}
      history={history.map((record) => ({
        ...record,
        _id: String(record._id),
        at: record.at.toISOString(),
        before: null,
        after: null,
      }))}
      teams={teams.items.map((team) => ({
        _id: String(team._id),
        name: team.name,
        managerId: team.managerId ?? null,
      }))}
      shifts={shifts.map((shift) => ({
        _id: String(shift._id),
        name: shift.name,
        timezone: shift.timezone,
      }))}
      colleagues={colleagues.items
        .filter((colleague) => String(colleague._id) !== id)
        .map((colleague) => ({
          _id: String(colleague._id),
          fullName: colleague.fullName,
        }))}
      shiftAssignments={shiftAssignments.map((assignment) => ({
        _id: String(assignment._id),
        shiftId: assignment.shiftId,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo ?? null,
      }))}
      teamAssignments={teamAssignments.map((assignment) => ({
        _id: String(assignment._id),
        teamId: assignment.teamId,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo ?? null,
      }))}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.USER_WRITE])}
    />
  );
}

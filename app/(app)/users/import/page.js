import { RosterImport } from '../../../../components/RosterImport.jsx';
import {
  listEmploymentTypes,
  listShifts,
  listTeams,
} from '../../../../database.js';

/**
 * S-08. Server component: it reads the configuration the import needs to offer
 * and hands it down as props.
 *
 * `proxy.js` has already gated this path on `user.import`, which is why the
 * route rule for it sits above the dynamic `/api/users/[id]` pattern that
 * would otherwise swallow it.
 */
export default async function RosterImportPage() {
  const [teams, employmentTypes] = await Promise.all([
    // FR-3.2: a soft-deleted team is no longer offered for assignment.
    listTeams({ includeDeleted: false }),
    listEmploymentTypes(),
  ]);

  // Shifts are per team (FR-3.3), so every team's are loaded and the grid
  // narrows them to whichever team a row is given.
  const shiftsByTeam = await Promise.all(
    teams.items.map((team) => listShifts(String(team._id))),
  );

  return (
    <RosterImport
      teams={teams.items.map((team) => ({
        _id: String(team._id),
        name: team.name,
      }))}
      shifts={shiftsByTeam.flatMap((result) =>
        result.items.map((shift) => ({
          _id: String(shift._id),
          teamId: shift.teamId,
          name: shift.name,
        })),
      )}
      employmentTypes={employmentTypes.items.map((type) => type.name)}
    />
  );
}

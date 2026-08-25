import { SCOPES } from '../constants/index.js';

/**
 * The scope half of `FR-1.2`, applied to a LIST rather than to one record.
 *
 * `guard.js` answers "does this scope reach this record" after the record has
 * been read. A screen showing a roster has to ask the question before the
 * read, or it fetches rows it must then throw away — and one forgotten filter
 * shows a colleague the whole company.
 *
 * This is what lets the merged summary be one screen for everybody: an
 * `EMPLOYEE` holding `attendance.read` at SELF sees their own row, a `MANAGER`
 * at TEAM sees their team, an `OFFICE_ADMIN` at ALL sees everyone. Narrowing a
 * scope on `S-19` changes what the screen shows on the next request, with no
 * code change (MVP criterion 4).
 */

/**
 * A user id nobody holds.
 *
 * Failing closed needs a filter that MATCHES NOTHING, and `null` means "do not
 * filter" to every query below this. A sentinel is the difference between a
 * viewer with no scope seeing an empty table and seeing the whole company.
 */
export const REACHES_NOBODY = '__none__';

/**
 * @param {string|null} scope the resolved scope, from `session.user.permissions`
 * @param {{userId: string, teamId: string|null}} viewer
 * @param {{teamId?: string, userId?: string}} requested what the URL asks for
 */
export function rosterFiltersFor(scope, viewer, requested = {}) {
  if (scope === SCOPES.ALL) {
    return {
      teamId: requested.teamId || null,
      userId: requested.userId || null,
      canFilterPeople: true,
    };
  }

  if (scope === SCOPES.TEAM) {
    // Their own team, not the one the URL names: a TEAM scope is a statement
    // about which team, and letting the query name it would make it decorative.
    if (!viewer.teamId) {
      return { teamId: null, userId: REACHES_NOBODY, canFilterPeople: false };
    }

    return {
      teamId: viewer.teamId,
      userId: requested.userId || null,
      canFilterPeople: true,
    };
  }

  if (scope === SCOPES.SELF) {
    return { teamId: null, userId: viewer.userId, canFilterPeople: false };
  }

  // No scope, or one this file does not know. Either way it reaches nothing:
  // failing open here would expose the roster the moment a scope went
  // undefined, which is DC-6's whole point.
  return { teamId: null, userId: REACHES_NOBODY, canFilterPeople: false };
}

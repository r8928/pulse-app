import { SCOPES } from '../constants/index.js';

/**
 * What the attendance summary opens on, read off the URL.
 *
 * This is not access control and must not be mistaken for it. `rosterScope.js`
 * decides which rows a viewer may see AT ALL, from the scope their
 * `attendance.read` is granted at, and it runs after this. What is decided
 * here is which of the rows they may already see they are shown FIRST: an
 * administrator arrives to read about everybody, a colleague arrives to read
 * about themselves, and either may say otherwise on the screen.
 *
 * `FR-8.1` is therefore untouched — a colleague still reads attendance
 * company-wide, as everyone could in the old workbook. They simply no longer
 * have to find their own row in it before they can read it.
 *
 * The view is a real URL value rather than the absence of a colleague filter.
 * Left implicit, a viewer switching AWAY from their own row would send an
 * empty `userId`, the default would fire again, and the toggle would appear
 * not to work.
 */

/** The two the toggle offers. TEAM is a permission scope, never a view. */
const VIEWS = new Set([SCOPES.SELF, SCOPES.ALL]);

/**
 * @param {Record<string, string|undefined>} params the resolved search params
 * @param {{admin: boolean, viewerId: string|null}} viewer
 */
export function attendanceViewFrom(params, { admin, viewerId }) {
  const requestedView = params?.view;

  // DC-6: a value the URL invents falls back to the default rather than to
  // the widest reading of it.
  const view = VIEWS.has(requestedView)
    ? requestedView
    : admin
      ? SCOPES.ALL
      : SCOPES.SELF;

  const self = view === SCOPES.SELF;

  return {
    view,

    /**
     * `FR-2.4` keeps a departed colleague's figures unchanged and marked, so
     * they can always be read. Off by default because the question the screen
     * answers most days is about the people currently working, and gated on
     * `isAdmin` because deciding to look at a former colleague's record is an
     * administrative act — the control is not on screen for anybody else, so
     * a `true` from them can only have been typed.
     */
    includeLeft: admin && params?.includeLeft === 'true',

    /**
     * What to ask `rosterFiltersFor` for. Under SELF the team and colleague
     * pickers are not on screen, so anything left in the URL from a previous
     * view is stale and must not narrow — or widen — what is shown.
     */
    requested: {
      teamId: self ? null : (params?.teamId ?? null),
      userId: self ? (viewerId ?? null) : (params?.userId ?? null),
    },
  };
}

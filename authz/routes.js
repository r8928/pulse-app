import { PERMISSIONS } from '../constants/index.js';

/**
 * Which permission each route requires — the endpoint half of FR-1.2.
 *
 * `proxy.js` asks this what a path needs, then asks `check.js` whether the
 * viewer holds it. The record half (does the scope reach *this* record) is
 * `guard.js`, called by the handler. FR-1.2 requires both.
 *
 * Order is significant: rules are tried top down and the first match wins, so
 * every static segment sits above the dynamic pattern that would swallow it.
 * `/users/import` is not a user id, and `/settings/access` is not the settings
 * page — a greedy match would hand the roster import to anyone with user.read
 * and the access control matrix to anyone with config.read.
 */

const ROUTE_RULES = [
  // Reachable by any signed-in user, whatever they hold.
  { pattern: /^\/$/, permission: null },
  { pattern: /^\/403$/, permission: null },
  { pattern: /^\/404$/, permission: null },

  { pattern: /^\/exceptions$/, permission: PERMISSIONS.EXCEPTIONS_READ },

  { pattern: /^\/users\/import$/, permission: PERMISSIONS.USER_IMPORT },
  { pattern: /^\/users(\/[^/]+)?$/, permission: PERMISSIONS.USER_READ },

  {
    pattern: /^\/attendance\/import$/,
    permission: PERMISSIONS.ATTENDANCE_IMPORT,
  },
  {
    pattern: /^\/attendance\/annual$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    pattern: /^\/attendance(\/[^/]+\/[^/]+)?$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },

  { pattern: /^\/leave$/, permission: PERMISSIONS.LEAVE_READ },
  { pattern: /^\/leave\/[^/]+\/ledger$/, permission: PERMISSIONS.LEAVE_READ },
  { pattern: /^\/pto$/, permission: PERMISSIONS.PTO_READ },

  { pattern: /^\/teams(\/[^/]+)?$/, permission: PERMISSIONS.TEAM_READ },

  { pattern: /^\/settings\/access$/, permission: PERMISSIONS.PERMISSION_WRITE },
  {
    pattern: /^\/settings\/holiday-calendars$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  { pattern: /^\/settings$/, permission: PERMISSIONS.CONFIG_READ },

  /**
   * Retired: the first two by the Attendance & Leaves merge, the daily grid
   * afterwards. Kept only so the redirects in `next.config.mjs` are reachable.
   *
   * `null` rather than a permission: there is no screen here any more, only a
   * forward to one that gates properly. Gating the doorway too would answer
   * 403 to somebody following an old link to a page they are allowed to read.
   * DC-6 still holds — the destination does the checking.
   */
  { pattern: /^\/reports(\/annual)?$/, permission: null },
  { pattern: /^\/attendance\/(entry|daily)$/, permission: null },

  { pattern: /^\/audit$/, permission: PERMISSIONS.AUDIT_READ },

  // API routes gate the same way as the screens they serve. Mutations assert
  // their write permission in the handler, through guard.js, because the
  // required permission depends on the method rather than the path.
  // Above the dynamic pattern, which would otherwise swallow it and hand the
  // go-live migration to anyone holding user.read.
  { pattern: /^\/api\/users\/import$/, permission: PERMISSIONS.USER_IMPORT },
  {
    pattern: /^\/api\/users\/import\/template$/,
    permission: PERMISSIONS.USER_IMPORT,
  },
  { pattern: /^\/api\/users(\/[^/]+)?$/, permission: PERMISSIONS.USER_READ },
  {
    pattern:
      /^\/api\/users\/[^/]+\/(soft-delete|restore|role|team|shift|flag|tenures)$/,
    permission: PERMISSIONS.USER_READ,
  },
  {
    pattern: /^\/api\/tenures\/[^/]+(\/soft-delete)?$/,
    permission: PERMISSIONS.USER_READ,
  },

  // Company-wide configuration. The path gates on config.read; a POST or PATCH
  // asserts config.write in the handler, because the permission a mutation
  // needs depends on the method rather than the path.
  {
    pattern: /^\/api\/employment-types(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/employment-types\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/authorised-domains(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/authorised-domains\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.CONFIG_READ,
  },

  // Reading the matrix is as sensitive as writing it: it is the map of who can
  // do what, and only the role that may edit it has any use for it.
  {
    pattern: /^\/api\/permission-grants$/,
    permission: PERMISSIONS.PERMISSION_WRITE,
  },

  // M-6. The path gates on team.read; the handlers assert team.write to change
  // a team and config.write to change anything inside one.
  {
    pattern: /^\/api\/teams\/[^/]+\/(soft-delete|policy)$/,
    permission: PERMISSIONS.TEAM_READ,
  },
  { pattern: /^\/api\/teams(\/[^/]+)?$/, permission: PERMISSIONS.TEAM_READ },
  {
    pattern: /^\/api\/(shifts|holidays)\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  /**
   * `S-26`. The path gates on config.read; every mutation asserts config.write
   * in the handler, the same split the team routes above use. The static
   * segments sit above the dynamic pattern that would otherwise swallow them.
   *
   * `/api/teams/[id]/weekly-off` is deliberately absent. It is gone, and
   * unlike a retired screen it is a write endpoint with no page behind it and
   * no link to it — so there is nothing for a stale bookmark to reach, and an
   * unmapped path answers 404 rather than falling through as public.
   */
  {
    pattern:
      /^\/api\/holiday-calendars\/[^/]+\/(soft-delete|teams|weekly-off)$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/holiday-calendars(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },

  // M-4 and M-5. The path gates on the read permission; each handler asserts
  // attendance.write or leave.write for its own method, the same split the
  // team routes above already use.
  {
    pattern: /^\/api\/punches\/[^/]+\/(soft-delete|duplicate)$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    pattern: /^\/api\/punches(\/[^/]+)?$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  // Above the dynamic attendance pattern, which would otherwise swallow
  // `import` as a user id and hand the bulk load to anyone with
  // attendance.read.
  {
    pattern: /^\/api\/attendance\/import\/(validate|commit|template)$/,
    permission: PERMISSIONS.ATTENDANCE_IMPORT,
  },
  // The detailed report behind the popup. Read only, so attendance.read —
  // producing a FILE of it stays report.build, on /api/reports/export.
  {
    pattern: /^\/api\/attendance\/day-by-day$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    pattern: /^\/api\/attendance\/[^/]+\/[^/]+\/override$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    pattern: /^\/api\/attendance(\/[^/]+\/[^/]+)?$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  // M-5. Above the leave-records patterns so neither swallows the other, and
  // the ledger route deliberately has no write method to gate.
  {
    pattern: /^\/api\/leave\/(balances|opening-balance|entitlement)$/,
    permission: PERMISSIONS.LEAVE_READ,
  },
  {
    pattern: /^\/api\/leave\/[^/]+\/ledger$/,
    permission: PERMISSIONS.LEAVE_READ,
  },
  {
    pattern: /^\/api\/leave-records\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.LEAVE_READ,
  },
  {
    pattern: /^\/api\/leave-records(\/[^/]+)?$/,
    permission: PERMISSIONS.LEAVE_READ,
  },
  // M-8. FR-8.1 splits these two: the annual summary is readable for any
  // colleague, the builder and the export are not. Above the collection
  // pattern, which would otherwise swallow both and hand them to report.build.
  {
    pattern: /^\/api\/reports\/annual$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    pattern: /^\/api\/reports(\/export)?$/,
    permission: PERMISSIONS.REPORT_BUILD,
  },

  // FR-2.11, §27. The queue reads on exceptions.read; each decision handler
  // asserts user.write, because a reduction soft deletes a user's own records.
  {
    pattern: /^\/api\/approvals\/[^/]+\/(approve|reject|restore)$/,
    permission: PERMISSIONS.EXCEPTIONS_READ,
  },
  { pattern: /^\/api\/approvals$/, permission: PERMISSIONS.EXCEPTIONS_READ },
  {
    pattern: /^\/api\/import-exceptions\/[^/]+\/dismiss$/,
    permission: PERMISSIONS.EXCEPTIONS_READ,
  },
  { pattern: /^\/api\/exceptions$/, permission: PERMISSIONS.EXCEPTIONS_READ },

  // §21, §22. CTO has no permission of its own — it spends PTO, so both halves
  // gate on pto.read here and assert pto.approve in the handler. `originate` is
  // above the dynamic pattern, which would otherwise swallow it as an award id.
  {
    pattern: /^\/api\/(pto|cto)\/originate$/,
    permission: PERMISSIONS.PTO_READ,
  },
  {
    pattern: /^\/api\/(pto|cto)\/[^/]+\/(approve|decline|expiry)$/,
    permission: PERMISSIONS.PTO_READ,
  },
  { pattern: /^\/api\/(pto|cto)$/, permission: PERMISSIONS.PTO_READ },
  {
    pattern: /^\/api\/(shifts|holidays)(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
];

/** Trailing slashes are cosmetic; they must not decide access. */
const normalise = (pathname) =>
  pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

/**
 * S-01 is the only unauthenticated screen. The Auth.js callback endpoints are
 * public too, or sign-in could never complete.
 */
export function isPublicPath(pathname) {
  const path = normalise(pathname);
  return path === '/signin' || path.startsWith('/api/auth/');
}

/**
 * Returns the permission a path requires, `null` where it requires none beyond
 * being signed in, and `undefined` where the path is not mapped at all.
 *
 * The three are deliberately distinct: an unmapped path must not fall through
 * as though it were public, so `proxy.js` can answer 404 rather than serve it.
 */
export function requiredPermissionFor(pathname) {
  const path = normalise(pathname);
  const rule = ROUTE_RULES.find((candidate) => candidate.pattern.test(path));
  return rule ? rule.permission : undefined;
}

/**
 * The user id a People path names, or `null` where it names none.
 *
 * The People module is administration rather than a staff directory, so a
 * viewer whose `user.read` does not reach the whole roster may read exactly
 * one record: their own. `proxy.js` compares this against the viewer's own id.
 *
 * It lives here rather than in `proxy.js` because it is a statement about the
 * shape of a route, which is what this file is for — and because a regex
 * written inline in the validator could not be exercised the way this can.
 *
 * `import` is excluded deliberately. `/users/import` is the go-live migration
 * with a rule of its own above the dynamic pattern; reading it as an id would
 * compare the word against the viewer's own and 404 the screen out from under
 * the administrator it belongs to.
 */
const USER_ID_PATH = /^(?:\/api)?\/users\/([^/]+)(?:\/.*)?$/;

export function userIdInPath(pathname) {
  const match = USER_ID_PATH.exec(normalise(pathname));
  if (!match) return null;
  return match[1] === 'import' ? null : match[1];
}

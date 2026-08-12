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
    pattern: /^\/attendance\/entry$/,
    permission: PERMISSIONS.ATTENDANCE_WRITE,
  },
  {
    pattern: /^\/attendance\/import$/,
    permission: PERMISSIONS.ATTENDANCE_IMPORT,
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
  { pattern: /^\/settings$/, permission: PERMISSIONS.CONFIG_READ },

  // FR-8.1: the annual summary is readable for any colleague; the report
  // builder beside it is explicitly not granted to EMPLOYEE.
  { pattern: /^\/reports\/annual$/, permission: PERMISSIONS.ATTENDANCE_READ },
  { pattern: /^\/reports$/, permission: PERMISSIONS.REPORT_BUILD },

  { pattern: /^\/audit$/, permission: PERMISSIONS.AUDIT_READ },

  // API routes gate the same way as the screens they serve. Mutations assert
  // their write permission in the handler, through guard.js, because the
  // required permission depends on the method rather than the path.
  { pattern: /^\/api\/users(\/[^/]+)?$/, permission: PERMISSIONS.USER_READ },
  {
    pattern: /^\/api\/users\/[^/]+\/(soft-delete|restore)$/,
    permission: PERMISSIONS.USER_READ,
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

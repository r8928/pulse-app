import { PERMISSIONS } from '../constants/index.js';

/**
 * The nine top-level modules, in nav order.
 *
 * Screens are shared, not per role: one screen per job, with controls
 * appearing or vanishing with the viewer's permissions. There is no IT user
 * list separate from an OFFICE_ADMIN one.
 *
 * `permission: null` means any signed-in user reaches it. Everything else is
 * gated on a permission stored as data, so moving a grant on S-19 changes the
 * navigation on the next request with no code change (FR-1.2).
 *
 * Data only, deliberately — no React and no icon imports. The shell maps a
 * route to its icon; keeping that out of here lets the gating logic be tested
 * without a DOM.
 *
 * S-15 (/pto) is not here: the navigation map in list-of-screens.md nests it
 * under Leave & Balances, and it is reached from S-13.
 */
export const NAVIGATION = Object.freeze([
  { id: 'M-2', label: 'Home', route: '/', permission: null },
  {
    id: 'M-2b',
    label: 'Exceptions',
    route: '/exceptions',
    permission: PERMISSIONS.EXCEPTIONS_READ,
  },
  {
    id: 'M-3',
    label: 'People',
    route: '/users',
    permission: PERMISSIONS.USER_READ,
  },
  {
    id: 'M-4',
    label: 'Attendance',
    route: '/attendance',
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    id: 'M-5',
    label: 'Leave & Balances',
    route: '/leave',
    permission: PERMISSIONS.LEAVE_READ,
  },
  {
    id: 'M-6',
    label: 'Teams',
    route: '/teams',
    permission: PERMISSIONS.TEAM_READ,
  },
  {
    id: 'M-7',
    label: 'Settings',
    route: '/settings',
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    id: 'M-8',
    label: 'Reports',
    route: '/reports',
    // FR-8.1: restricted. The S-09 attendance read surface is granted to
    // EMPLOYEE; this report builder beside it deliberately is not.
    permission: PERMISSIONS.REPORT_BUILD,
  },
  {
    id: 'M-9',
    label: 'Audit',
    route: '/audit',
    permission: PERMISSIONS.AUDIT_READ,
  },
]);

/**
 * The modules a viewer's permissions reach.
 *
 * `permissions` is the resolved permission-to-scope map from `session.js`. An
 * absent map is treated as holding nothing rather than everything: failing
 * open would expose every module the moment it went undefined (DC-6).
 */
export function visibleNavigation(permissions) {
  const held = permissions ?? {};
  return NAVIGATION.filter(
    (item) => item.permission === null || Boolean(held[item.permission]),
  );
}

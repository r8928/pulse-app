import { isAdmin } from '../authz/admin.js';
import { PERMISSIONS } from '../constants/index.js';

/**
 * The eight top-level modules, in nav order.
 *
 * Screens are shared, not per role: one screen per job, with controls
 * appearing or vanishing with the viewer's permissions. There is no IT user
 * list separate from an OFFICE_ADMIN one.
 *
 * `permission: null` means any signed-in user reaches it. Everything else is
 * gated on a permission stored as data, so moving a grant on S-19 changes the
 * navigation on the next request with no code change (FR-1.2).
 *
 * `adminOnly` narrows that further: the permission has to be held at ALL, not
 * merely held. Only People carries it. The module is administration rather
 * than a staff directory — the whole user lifecycle, and the phone numbers —
 * and a colleague reaches their own record directly, never through the list.
 * See `authz/admin.js` for why the test is a scope and not a role name.
 *
 * Data only, deliberately — no React and no icon imports. The shell maps a
 * route to its icon; keeping that out of here lets the gating logic be tested
 * without a DOM.
 *
 * S-15 (/pto) is not here: the navigation map in list-of-screens.md nests it
 * under Leaves & Balances, and it is reached from there.
 *
 * M-8 (/reports) is gone. The report builder's columns are now part of the
 * attendance summary and the export is a button on it, so a separate module
 * would be a second door to the same room — with the scope confusion that
 * comes of two screens over one dataset. `report.build` still gates the
 * export, and the annual summary lives at /attendance/annual.
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
    adminOnly: true,
  },
  {
    id: 'M-4',
    label: 'Attendance',
    route: '/attendance',
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  {
    id: 'M-5',
    label: 'Leaves & Balances',
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

  return NAVIGATION.filter((item) => {
    if (item.permission === null) return true;
    if (!held[item.permission]) return false;
    return item.adminOnly ? isAdmin(held) : true;
  });
}

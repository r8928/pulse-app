import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';

/**
 * The grants each role starts with, and the only place they are written down.
 *
 * They live here rather than inside `scripts/seed.js` because they are the
 * substance of the access model, not a detail of loading it: `authz/admin.js`
 * decides who administers Pulse by reading a scope out of this table, and the
 * seed script cannot be imported by a test — it runs on import and exits
 * without `SEED_ADMIN_EMAIL`. Untestable seed data is how a grant drifts.
 *
 * Every one of these is a STARTING POINT, never a rule. `FR-1.2` stores each
 * as an editable row, so `S-19` may narrow or widen any of them on the next
 * request with no redeploy — which is MVP criterion 4, and the reason nothing
 * downstream may branch on a role name instead.
 */

/**
 * FR-1.3: OFFICE_ADMIN holds every permission the system defines at ALL, and
 * its set is a permanent superset. Generated from the catalog rather than
 * listed, so a permission added later is granted automatically.
 */
const officeAdminGrants = ALL_PERMISSIONS.map((permission) => ({
  role: ROLES.OFFICE_ADMIN,
  permission,
  scope: SCOPES.ALL,
}));

/** FR-2.1: the user lifecycle only. That is the whole of IT's authority. */
const itGrants = [
  PERMISSIONS.USER_READ,
  PERMISSIONS.USER_WRITE,
  PERMISSIONS.USER_IMPORT,
].map((permission) => ({ role: ROLES.IT, permission, scope: SCOPES.ALL }));

/**
 * FR-6.7: the MANAGER leave-approval permission and its TEAM scope are seeded
 * in Phase 1 and visible on S-19 from day one, even though the request and
 * approval workflow ships in Phase 2.
 */
const managerGrants = [
  { permission: PERMISSIONS.USER_READ, scope: SCOPES.SELF },
  { permission: PERMISSIONS.ATTENDANCE_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.LEAVE_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.PTO_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.LEAVE_APPROVE, scope: SCOPES.TEAM },
].map((grant) => ({ role: ROLES.MANAGER, ...grant }));

/**
 * FR-8.1: EMPLOYEE reads attendance company-wide, as everyone could in the old
 * workbook — expressed as a grant at ALL so it can be narrowed on S-19 with no
 * code change, which is MVP criterion 4.
 *
 * FR-8.2: read only without exception. No write, import, approve, report.build
 * or exceptions.read appears here.
 *
 * `user.read` is the exception, and it is SELF for both EMPLOYEE and MANAGER.
 * The People module is administration rather than a staff directory — the
 * whole user lifecycle, and the phone numbers — so it belongs to the two roles
 * that administer it: OFFICE_ADMIN (FR-1.3) and IT (FR-2.1). A colleague still
 * reads their OWN record, which is what SELF buys over withholding the grant
 * altogether: `authz/admin.js` reads the scope, `proxy.js` sends them to their
 * own profile and answers 404 for anybody else's.
 */
const employeeGrants = [
  { permission: PERMISSIONS.USER_READ, scope: SCOPES.SELF },
  { permission: PERMISSIONS.ATTENDANCE_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.LEAVE_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.PTO_READ, scope: SCOPES.ALL },
].map((grant) => ({ role: ROLES.EMPLOYEE, ...grant }));

export const SEED_GRANTS = Object.freeze([
  ...officeAdminGrants,
  ...itGrants,
  ...managerGrants,
  ...employeeGrants,
]);

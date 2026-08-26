import { PERMISSIONS, SCOPES } from '../constants/index.js';

/**
 * Who counts as an administrator, answered from grant data rather than from a
 * role name.
 *
 * `session.js` is explicit that no client may branch on
 * `role === 'OFFICE_ADMIN'`: it would hardcode in the UI exactly what `FR-1.2`
 * stores as editable data, and `S-19` would stop controlling it. So the test
 * is a permission held at a scope, and moving that one cell on `S-19` changes
 * the sidebar, the attendance default and the roster columns on the next
 * request with no code change.
 *
 * The permission chosen is `user.read` AT ALL — reaching the whole roster.
 *
 * It is the only one that separates the two groups. `FR-8.1` deliberately
 * gives an ordinary colleague `attendance.read`, `leave.read` and `pto.read`
 * at ALL, as everyone had in the old workbook, so none of those can tell an
 * administrator from anybody else. Reading every colleague's record is the
 * authority that actually distinguishes one, and it is what `OFFICE_ADMIN`
 * (`FR-1.3`, every permission at ALL) and `IT` (`FR-2.1`, the user lifecycle
 * is the whole of its authority) hold and nobody else does.
 */
export function isAdmin(permissions) {
  return permissions?.[PERMISSIONS.USER_READ] === SCOPES.ALL;
}

import { auth } from './auth.js';
import { resolveScope } from './authz/check.js';
import { ALL_PERMISSIONS } from './constants/index.js';
import { findUserByWorkEmail, getPermissionGrants } from './database.js';

/**
 * The one place a server component or route handler reads the current user.
 *
 * CLAUDE.md: session data flows one way. The server reads it here and passes
 * `session.user` down as a prop to the client leaf. Client components never
 * read the session themselves, and every role-dependent control derives from
 * that prop — which is why `permissions` below is a resolved map rather than
 * a role name. A client that branches on `user.role === 'OFFICE_ADMIN'` would
 * hardcode in the UI exactly what FR-1.2 stores as editable data.
 *
 * Role and grants are read on every call, never cached, so an S-19 edit or a
 * role change takes effect on the next request (FR-1.2, FR-1.7).
 */
export async function getSessionUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const user = await findUserByWorkEmail(email);

  // FR-2.4: a soft deleted user loses access immediately, mid-session and
  // without waiting for any approval.
  if (!user || user.deletedAt || !user.loginEnabled) return null;

  const grants = await getPermissionGrants();

  // The full resolved map, so the client can show or hide a control without
  // knowing which role holds what.
  const permissions = {};
  for (const permission of ALL_PERMISSIONS) {
    const scope = resolveScope(grants, user.role, permission);
    if (scope) permissions[permission] = scope;
  }

  return {
    userId: String(user._id),
    name: user.fullName,
    email: user.workEmail,
    employeeCode: user.employeeCode,
    role: user.role,
    teamId: user.teamId ?? null,
    permissions,
  };
}

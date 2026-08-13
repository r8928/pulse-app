import { AccessMatrix } from '../../../../components/AccessMatrix.jsx';
import { PERMISSIONS } from '../../../../constants/index.js';
import { listPermissionGrants } from '../../../../database.js';
import { getSessionUser } from '../../../../session.js';

/**
 * S-19. Server component: it reads the session and the grants, and hands both
 * down as props.
 *
 * The grants are read here on every request and cached nowhere, which is what
 * makes an edit effective on the next one (FR-1.2, MVP criteria 4 and 7).
 */
export default async function AccessControlPage() {
  const [viewer, grants] = await Promise.all([
    getSessionUser(),
    listPermissionGrants(),
  ]);

  return (
    <AccessMatrix
      grants={grants.items.map((grant) => ({
        _id: String(grant._id),
        role: grant.role,
        permission: grant.permission,
        scope: grant.scope ?? null,
        version: grant.version,
      }))}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.PERMISSION_WRITE])}
    />
  );
}

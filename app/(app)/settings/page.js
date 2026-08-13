import { CompanySettings } from '../../../components/CompanySettings.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  listAuthorisedDomains,
  listEmploymentTypes,
} from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-18. Server component: it reads the session and the data, and hands both
 * down as props. The client leaf reads no session of its own.
 */

/** ObjectId and Date do not cross the server/client boundary as themselves. */
const serialise = (item) => ({
  _id: String(item._id),
  name: item.name ?? null,
  domain: item.domain ?? null,
  version: item.version,
});

export default async function SettingsPage() {
  const [viewer, types, domains] = await Promise.all([
    getSessionUser(),
    listEmploymentTypes(),
    listAuthorisedDomains(),
  ]);

  return (
    <CompanySettings
      employmentTypes={types.items.map(serialise)}
      domains={domains.items.map(serialise)}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.CONFIG_WRITE])}
    />
  );
}

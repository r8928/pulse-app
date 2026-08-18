import { UserRoster } from '../../../components/UserRoster.jsx';
import {
  EMPLOYMENT_TYPE_SEEDS,
  PERMISSIONS,
} from '../../../constants/index.js';
import { listUsers } from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-06. Server component: it reads the session and the data, and hands both
 * down as props. The client leaf reads no session of its own.
 */
export default async function UsersPage({ searchParams }) {
  const params = await searchParams;
  const user = await getSessionUser();

  const { items, total, activeCount } = await listUsers({
    search: params?.search ?? '',
    page: Number(params?.page ?? 1),
  });

  return (
    <UserRoster
      // Serialised, because ObjectId and Date do not cross the server/client
      // boundary as themselves.
      users={items.map((item) => ({
        ...item,
        _id: String(item._id),
        deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
      }))}
      total={total}
      activeCount={activeCount}
      canWrite={Boolean(user.permissions[PERMISSIONS.USER_WRITE])}
      canImport={Boolean(user.permissions[PERMISSIONS.USER_IMPORT])}
      employmentTypes={Object.values(EMPLOYMENT_TYPE_SEEDS)}
    />
  );
}

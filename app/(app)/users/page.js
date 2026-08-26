import { UserRoster } from '../../../components/UserRoster.jsx';
import {
  EMPLOYMENT_TYPE_SEEDS,
  PERMISSIONS,
} from '../../../constants/index.js';
import { listTeamsWithShifts, listUsers } from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-06. Server component: it reads the session and the data, and hands both
 * down as props. The client leaf reads no session of its own.
 */
export default async function UsersPage({ searchParams }) {
  const params = await searchParams;
  const user = await getSessionUser();

  /**
   * The teams and their shifts are read here rather than inside the dialog:
   * `FR-2.1` puts both on the create form, and a client component cannot
   * reach the database. Already serialised by `listTeamsWithShifts`.
   */
  const [{ items, total, activeCount }, teams] = await Promise.all([
    listUsers({
      search: params?.search ?? '',
      page: Number(params?.page ?? 1),
    }),
    listTeamsWithShifts(),
  ]);

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
      teams={teams}
    />
  );
}

import { notFound } from 'next/navigation';
import { UserDetail } from '../../../../components/UserDetail.jsx';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getRecordHistory, getUserById } from '../../../../database.js';
import { getSessionUser } from '../../../../session.js';

/**
 * S-07. A user the viewer's scope does not reach resolves to 404 rather than
 * 403, so its existence is not leaked (S-03).
 */
export default async function UserDetailPage({ params }) {
  const { id } = await params;

  const [viewer, user] = await Promise.all([getSessionUser(), getUserById(id)]);

  if (!user) notFound();

  const history = await getRecordHistory('user', id);

  return (
    <UserDetail
      user={{
        ...user,
        _id: String(user._id),
        deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
        tenures: user.tenures.map((tenure) => ({
          ...tenure,
          _id: String(tenure._id),
          deletedAt: tenure.deletedAt ? tenure.deletedAt.toISOString() : null,
          createdAt: null,
        })),
        createdAt: null,
        updatedAt: null,
      }}
      history={history.map((record) => ({
        ...record,
        _id: String(record._id),
        at: record.at.toISOString(),
        before: null,
        after: null,
      }))}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.USER_WRITE])}
    />
  );
}

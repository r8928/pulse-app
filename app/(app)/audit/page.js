import { AuditLog } from '../../../components/AuditLog.jsx';
import { listAuditActions, listAuditRecords } from '../../../database.js';

/**
 * S-22. Server component: the filters arrive in the URL, the server pages the
 * result, and the client leaf renders it.
 *
 * `proxy.js` has already gated this path on `audit.read`. The log grows
 * without limit and is never truncated (`FR-9.1`), so it is paged rather than
 * materialised (`NFR-3`, `DC-10`).
 */
export default async function AuditPage({ searchParams }) {
  const params = await searchParams;

  const page = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = Math.min(100, Number(params?.pageSize ?? 50) || 50);

  const [result, filters] = await Promise.all([
    listAuditRecords({
      actorName: params?.actorName ?? null,
      action: params?.action ?? null,
      entityType: params?.entityType ?? null,
      from: params?.from ?? null,
      to: params?.to ?? null,
      page,
      pageSize,
    }),
    listAuditActions(),
  ]);

  return (
    <AuditLog
      records={result.items.map((record) => ({
        ...record,
        _id: String(record._id),
        // FR-9.2: the whole documents, not a diff, so P-44 can show them side
        // by side. They cross the boundary as plain JSON.
        at: record.at.toISOString(),
      }))}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      actions={filters.actions}
      entityTypes={filters.entityTypes}
    />
  );
}

import Stack from '@mui/material/Stack';
import { endOfYear, format, startOfYear } from 'date-fns';
import { ExceptionsDashboard } from '../../../components/exceptions/ExceptionsDashboard.jsx';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import { listUsers } from '../../../database.js';
import { countExceptionQueues } from '../../../engine/exceptions.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-05. The single work queue: every unresolved item in the system surfaces
 * here and nowhere else (`FR-8.6`).
 *
 * The counts are computed on the server so a tab shows what is waiting before
 * anyone opens it. The rows are not: `NFR-3` and `DC-10` require a page rather
 * than the whole backlog, and only the open tab's page is ever fetched.
 */
export default async function ExceptionsPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const now = new Date();
  const filters = {
    from: params?.from ?? format(startOfYear(now), 'yyyy-MM-dd'),
    to: params?.to ?? format(endOfYear(now), 'yyyy-MM-dd'),
  };

  const [counts, roster] = await Promise.all([
    countExceptionQueues(filters),
    listUsers({ includeDeleted: false, pageSize: 500 }),
  ]);

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Exceptions'
        description='The single work queue. Every unresolved item in the system surfaces here and nowhere else, with approve, approve with a changed amount, and decline on each row where those apply.'
      />

      <ExceptionsDashboard
        counts={counts}
        filters={filters}
        canDecide={Boolean(viewer?.permissions[PERMISSIONS.USER_WRITE])}
        canImport={Boolean(viewer?.permissions[PERMISSIONS.ATTENDANCE_IMPORT])}
        people={roster.items.map((person) => ({
          _id: String(person._id),
          fullName: person.fullName,
        }))}
      />
    </Stack>
  );
}

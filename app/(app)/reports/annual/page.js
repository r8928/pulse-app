import Stack from '@mui/material/Stack';
import { getYear } from 'date-fns';
import { PageHeader } from '../../../../components/PageHeader.jsx';
import { AnnualSummary } from '../../../../components/reports/AnnualSummary.jsx';
import { listUsers } from '../../../../database.js';
import { buildAnnualSummary } from '../../../../engine/reports.js';
import { getSessionUser } from '../../../../session.js';

/**
 * S-21, `FR-8.4`. One colleague's year, aggregating every month.
 *
 * `attendance.read`, seeded at `ALL` per `FR-8.1` — readable for any
 * colleague, exactly as everyone could read everyone's in the old workbook.
 * That is what separates this from `S-20` beside it.
 *
 * With no colleague named, it opens on the viewer's own year, which is what
 * somebody arriving from `S-04` almost always wants.
 */
export default async function AnnualSummaryPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const roster = await listUsers({ includeDeleted: true, pageSize: 500 });

  const filters = {
    userId: params?.userId ?? viewer?.userId ?? '',
    year: params?.year ?? String(getYear(new Date())),
  };

  const summary = filters.userId
    ? await buildAnnualSummary(filters.userId, Number(filters.year))
    : null;

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Annual summary'
        description='One user year, aggregating every month. A month with no data renders as an explicit zero row and is never silently omitted — this was workbook defect F1. Months outside the employment period are marked as such rather than shown as absence.'
      />

      <AnnualSummary
        summary={summary}
        people={roster.items.map((person) => ({
          _id: String(person._id),
          fullName: person.fullName,
        }))}
        filters={filters}
      />
    </Stack>
  );
}

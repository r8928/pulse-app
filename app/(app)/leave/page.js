import Stack from '@mui/material/Stack';
import { endOfYear, format, startOfYear } from 'date-fns';
import { LeaveBalances } from '../../../components/leave/LeaveBalances.jsx';
import { PageHeader } from '../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  getTeamPolicy,
  getUserById,
  listTeams,
  listTrackedUserIds,
  summariseBalances,
} from '../../../database.js';
import { leaveYearsTouchedBy } from '../../../engine/accrual.js';
import { ensureEntitlementCredited } from '../../../engine/entitlement.js';
import { WFH_LEAVE_TYPE } from '../../../engine/ledger.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-13. Every figure is replayed from the ledger and never stored (DC-4).
 *
 * D-12: the leave years the range touches are credited on the way through,
 * because no cron exists to do it. The guard is idempotent, so opening this
 * screen twice credits once.
 */
export default async function LeaveBalancesPage({ searchParams }) {
  const params = await searchParams;
  const viewer = await getSessionUser();

  const today = new Date();
  const filters = {
    from: params?.from ?? format(startOfYear(today), 'yyyy-MM-dd'),
    to: params?.to ?? format(endOfYear(today), 'yyyy-MM-dd'),
    teamId: params?.teamId ?? '',
    userId: params?.userId ?? '',
  };

  const teams = await listTeams({ includeDeleted: false, pageSize: 200 });

  const userIds = filters.userId
    ? [filters.userId]
    : await listTrackedUserIds({ teamId: filters.teamId || null });

  for (const id of userIds) {
    for (const year of leaveYearsTouchedBy(filters)) {
      await ensureEntitlementCredited(id, year, {
        userId: viewer?.userId ?? 'system',
        name: viewer?.name ?? 'Pulse engine',
      });
    }
  }

  const { rows } = await summariseBalances({
    userIds,
    from: filters.from,
    to: filters.to,
  });

  const people = await Promise.all(userIds.map((id) => getUserById(id)));
  const byId = new Map(
    people.filter(Boolean).map((person) => [String(person._id), person]),
  );

  /**
   * FR-6.4 makes the leave types editable at runtime, so the columns come from
   * what the ledger actually holds rather than from today's policy — a type no
   * longer offered still shows the days already taken under it. The WFH
   * pseudo-type has its own column and is kept out of these.
   */
  const leaveTypes = [
    ...new Set(
      rows
        .map((row) => row.leaveType)
        .filter((type) => type !== WFH_LEAVE_TYPE),
    ),
  ].sort();

  const grouped = userIds
    .map((id) => {
      const person = byId.get(id);
      if (!person) return null;

      const mine = rows.filter((row) => row.userId === id);

      return {
        userId: id,
        fullName: person.fullName,
        employeeCode: person.employeeCode,
        deletedAt: person.deletedAt ? person.deletedAt.toISOString() : null,
        byType: Object.fromEntries(
          mine
            .filter((row) => row.leaveType !== WFH_LEAVE_TYPE)
            .map((row) => [
              row.leaveType,
              {
                opening: row.opening,
                credited: row.credited,
                availed: row.availed,
                deductions: row.deductions,
                ctoApplied: row.ctoApplied,
                balance: row.balance,
              },
            ]),
        ),
        wfhUsed:
          mine.find((row) => row.leaveType === WFH_LEAVE_TYPE)?.wfhUsed ?? 0,
      };
    })
    .filter(Boolean)
    .filter((row) => Object.keys(row.byType).length > 0 || row.wfhUsed > 0);

  const policy = filters.teamId ? await getTeamPolicy(filters.teamId) : null;

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Leave & balances'
        description='Typed leave balances per colleague. Every figure is replayed from the ledger and never stored, so each links to the movements that produced it. Paternity and maternity are typed balances of their own and never touch the standard one.'
      />

      <LeaveBalances
        rows={grouped}
        teams={teams.items.map((team) => ({
          _id: String(team._id),
          name: team.name,
        }))}
        leaveTypes={leaveTypes}
        wfhQuota={policy?.wfhQuotaDaysPerMonth ?? '—'}
        filters={filters}
        canWrite={Boolean(viewer?.permissions[PERMISSIONS.LEAVE_WRITE])}
        viewerId={viewer?.userId ?? null}
      />
    </Stack>
  );
}

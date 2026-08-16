import Stack from '@mui/material/Stack';
import { DayRecordDetail } from '../../../../../components/attendance/DayRecordDetail.jsx';
import { EmptyState } from '../../../../../components/EmptyState.jsx';
import { PageHeader } from '../../../../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  getDayRecord,
  getLeaveRecordsForUserDates,
  getTeamPolicy,
  getUserById,
  listLedgerEntriesForSource,
  listPunchesForUserDates,
  resolveShiftAssignmentsWithShifts,
} from '../../../../../database.js';
import { getSessionUser } from '../../../../../session.js';

/**
 * S-12. Everything the engine concluded about one user on one date, and why.
 *
 * FR-2.12: a date in a tenure gap carries no day record at all, and saying so
 * is the answer — not an empty shell that would read as an absence.
 */
export default async function DayRecordPage({ params }) {
  const { userId, date } = await params;

  const [viewer, user, dayRecord] = await Promise.all([
    getSessionUser(),
    getUserById(userId),
    getDayRecord(userId, date),
  ]);

  if (!user || !dayRecord) {
    return (
      <Stack spacing={3}>
        <PageHeader
          title='Day record'
          description='Everything the engine concluded about one colleague on one date.'
        />
        <EmptyState
          title='No day record for this date'
          description={`Nothing has been recorded for ${user?.fullName ?? 'this colleague'} on ${date}. A date outside their employment period, or one nothing has touched, carries no record at all.`}
        />
      </Stack>
    );
  }

  const assignments = await resolveShiftAssignmentsWithShifts(userId, { user });
  const covering = assignments.find(
    (assignment) =>
      assignment.effectiveFrom <= date &&
      (assignment.effectiveTo === null || assignment.effectiveTo >= date),
  );

  const [punches, leaveRecords, ledgerEntries, policy] = await Promise.all([
    listPunchesForUserDates(userId, [date], { includeDeleted: true }),
    getLeaveRecordsForUserDates(userId, [date]),
    listLedgerEntriesForSource('dayRecord', String(dayRecord._id)),
    getTeamPolicy(dayRecord.teamId ?? user.teamId),
  ]);

  return (
    <Stack spacing={3}>
      <PageHeader
        title={`${user.fullName} — ${date}`}
        description="Each override sits beside the engine's value with who, why and when. A recalculation refreshes the engine's value and leaves the override standing."
      />

      <DayRecordDetail
        user={{
          _id: String(user._id),
          fullName: user.fullName,
          employeeCode: user.employeeCode,
        }}
        dayRecord={{
          _id: String(dayRecord._id),
          date: dayRecord.date,
          version: dayRecord.version,
          dayType: dayRecord.dayType,
          computed: dayRecord.computed,
          override: dayRecord.override
            ? { ...dayRecord.override, at: dayRecord.override.at.toISOString() }
            : null,
          exceptions: dayRecord.exceptions ?? [],
        }}
        punches={punches.map((punch) => ({
          _id: String(punch._id),
          type: punch.type,
          at: punch.at.toISOString(),
          source: punch.source,
          workDate: punch.workDate,
          isDuplicate: punch.isDuplicate,
          deletedAt: punch.deletedAt ? punch.deletedAt.toISOString() : null,
          version: punch.version,
        }))}
        leaveRecord={
          leaveRecords[0]
            ? {
                _id: String(leaveRecords[0]._id),
                leaveType: leaveRecords[0].leaveType,
                amount: leaveRecords[0].amount,
                halfDayPeriod: leaveRecords[0].halfDayPeriod,
                version: leaveRecords[0].version,
              }
            : null
        }
        ledgerEntries={ledgerEntries.map((entry) => ({
          _id: String(entry._id),
          entryType: entry.entryType,
          leaveType: entry.leaveType,
          amount: entry.amount,
          rule: entry.rule,
          reversalOf: entry.reversalOf ? String(entry.reversalOf) : null,
          createdAt: entry.createdAt.toISOString(),
        }))}
        shift={
          covering?.shift
            ? {
                _id: String(covering.shift._id),
                name: covering.shift.name,
                timezone: covering.shift.timezone,
                requiredDailyMinutes: covering.shift.requiredDailyMinutes,
              }
            : null
        }
        canWrite={Boolean(viewer?.permissions[PERMISSIONS.ATTENDANCE_WRITE])}
        leaveTypes={policy?.leaveTypes ?? []}
      />
    </Stack>
  );
}

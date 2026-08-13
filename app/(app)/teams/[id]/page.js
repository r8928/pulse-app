import { notFound } from 'next/navigation';
import { TeamConfiguration } from '../../../../components/TeamConfiguration.jsx';
import { PERMISSIONS } from '../../../../constants/index.js';
import { getTeamConfiguration, listUsers } from '../../../../database.js';
import { getSessionUser } from '../../../../session.js';

/**
 * S-17. Server component: it reads the session and the whole of one team's
 * configuration, and hands both down as props.
 *
 * The gaps arrive with the data rather than being worked out on the client,
 * because the same function decides them for the S-05 queue — one answer, one
 * place (`FR-3.13`).
 */
export default async function TeamConfigurationPage({ params }) {
  const { id } = await params;

  const [viewer, configuration] = await Promise.all([
    getSessionUser(),
    getTeamConfiguration(id),
  ]);

  if (!configuration) notFound();

  const [members, users] = await Promise.all([
    listUsers({ teamId: id, includeDeleted: false, pageSize: 1000 }),
    listUsers({ includeDeleted: false, pageSize: 1000 }),
  ]);

  // ObjectId and Date do not cross the server/client boundary as themselves.
  const plain = (item, fields) =>
    Object.fromEntries([
      ['_id', String(item._id)],
      ...fields.map((field) => [field, item[field] ?? null]),
    ]);

  return (
    <TeamConfiguration
      configuration={{
        team: {
          ...plain(configuration.team, [
            'name',
            'managerId',
            'defaultShiftId',
            'version',
          ]),
          managerName:
            users.items.find(
              (user) => String(user._id) === configuration.team.managerId,
            )?.fullName ?? null,
        },
        shifts: configuration.shifts.map((shift) =>
          plain(shift, [
            'name',
            'startTime',
            'endTime',
            'requiredDailyMinutes',
            'graceMinutes',
            'timezone',
            'version',
          ]),
        ),
        holidays: configuration.holidays.map((holiday) =>
          plain(holiday, ['date', 'name', 'type', 'version']),
        ),
        weeklyOffPattern: configuration.weeklyOffPattern
          ? plain(configuration.weeklyOffPattern, ['daysOfWeek', 'version'])
          : null,
        policy: configuration.policy
          ? {
              ...plain(configuration.policy, [
                'leaveTypes',
                'accrualPeriod',
                'carryForward',
                'automaticDeductionLeaveType',
                'leaveDeductionLadder',
                'ptoAwardLadder',
                'ptoValidityDays',
                'ctoApplicationLadder',
                'wfhQuotaDaysPerMonth',
                'shortDayThresholdPercent',
                'holidayWorkThresholdPercent',
                'midnightCrossingWindowHours',
                'duplicatePunchWindowMinutes',
                'version',
              ]),
            }
          : null,
        gaps: configuration.gaps,
        members: members.items.map((member) =>
          plain(member, ['fullName', 'employeeCode']),
        ),
      }}
      users={users.items.map((user) => plain(user, ['fullName']))}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.CONFIG_WRITE])}
    />
  );
}

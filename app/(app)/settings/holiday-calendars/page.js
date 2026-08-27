import { HolidayCalendars } from '../../../../components/HolidayCalendars.jsx';
import { PERMISSIONS } from '../../../../constants/index.js';
import { listHolidayCalendarsWithDetail } from '../../../../database.js';
import { getSessionUser } from '../../../../session.js';

/**
 * S-26. Server component: it reads the session and the data, and hands both
 * down as props. The client leaf reads no session of its own.
 */

/** ObjectId and Date do not cross the server/client boundary as themselves. */
const plain = (item, fields) =>
  Object.fromEntries([
    ['_id', String(item._id)],
    ...fields.map((field) => [field, item[field] ?? null]),
  ]);

export default async function HolidayCalendarsPage() {
  const [viewer, { calendars, teams }] = await Promise.all([
    getSessionUser(),
    listHolidayCalendarsWithDetail(),
  ]);

  return (
    <HolidayCalendars
      calendars={calendars.map((calendar) => ({
        ...plain(calendar, ['name', 'version']),
        teams: calendar.teams,
        holidays: calendar.holidays.map((holiday) =>
          plain(holiday, ['date', 'name', 'type', 'version']),
        ),
        weeklyOffPattern: calendar.weeklyOffPattern
          ? plain(calendar.weeklyOffPattern, ['daysOfWeek', 'version'])
          : null,
      }))}
      teams={teams}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.CONFIG_WRITE])}
    />
  );
}

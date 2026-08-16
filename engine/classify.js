import { getDay, parseISO } from 'date-fns';
import { DAY_STATUS, DAY_TYPE } from '../constants/index.js';

/**
 * §15. A fact about the date for the team held on it, not about the person —
 * no override exists for this value (FR-5.9). Comes first because §16's
 * status rules branch on it.
 *
 * A date that is both a holiday and the weekly-off pattern resolves HOLIDAY:
 * it was explicitly entered for this team, while weekly off is a standing
 * pattern. This affects only the label — both are non-working, so §16
 * treats them identically for status.
 *
 * @param {string} date 'YYYY-MM-DD'
 * @param {Array<{ date: string, deletedAt: Date|null }>} holidays this team's calendar
 * @param {{ daysOfWeek: number[] } | null} weeklyOffPattern
 * @returns {string} one of DAY_TYPE's values
 */
export function resolveDayType(date, holidays, weeklyOffPattern) {
  const isHoliday = holidays.some(
    (holiday) => holiday.date === date && !holiday.deletedAt,
  );
  if (isHoliday) return DAY_TYPE.HOLIDAY;

  // date-fns getDay: 0 = Sunday .. 6 = Saturday, the same convention
  // weeklyOffPatternSchema documents (database.js).
  const dayOfWeek = getDay(parseISO(date));
  if (weeklyOffPattern?.daysOfWeek?.includes(dayOfWeek)) {
    return DAY_TYPE.WEEKLY_OFF;
  }

  return DAY_TYPE.WORKING;
}

/**
 * §16, FR-5.9. A fixed order, the same for every team, never configurable:
 * an OFFICE_ADMIN status override first, then authorised leave, then what
 * the punches show.
 *
 * @param {{
 *   dayType: string,
 *   override: { dayStatus: string } | null,
 *   authorisedLeave: object | null,
 *   punches: Array,
 * }} input
 * @returns {string} one of DAY_STATUS's values
 */
export function resolveDayStatus({
  dayType,
  override,
  authorisedLeave,
  punches,
}) {
  if (override?.dayStatus) return override.dayStatus;
  if (authorisedLeave) return DAY_STATUS.LEAVE;

  const hasPunches = punches.length > 0;

  if (dayType !== DAY_TYPE.WORKING) {
    if (hasPunches) return DAY_STATUS.HOLIDAY_WORK;
    return dayType === DAY_TYPE.HOLIDAY
      ? DAY_STATUS.HOLIDAY
      : DAY_STATUS.WEEKLY_OFF;
  }

  return hasPunches ? DAY_STATUS.WFO : DAY_STATUS.ABSENT;
}

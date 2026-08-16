import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * A worked duration, read the way a timesheet reads: hours and minutes, never
 * a decimal. "8.03 hours" is not a figure anyone can check against a clock.
 */
export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  return `${hours}h ${String(total % 60).padStart(2, '0')}m`;
}

/**
 * §7.2: an instant is stored in UTC and READ in the timezone of the shift it
 * belongs to. Showing a punch in the reader's own zone would put a Karachi
 * night shift on the wrong side of midnight for anyone viewing from elsewhere.
 */
export function formatClock(instant, timezone) {
  return format(toZonedTime(instant, timezone), 'HH:mm');
}

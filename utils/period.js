import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid as isValidDate,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { PERIOD_MODE, WEEK_STARTS_ON } from '../constants/index.js';

/**
 * The Weekly / Monthly / Custom filter, as data.
 *
 * What travels in the URL is the MODE and an ANCHOR, never the resolved range.
 * A stored range cannot be stepped forward without first working out which
 * week or month it was, and two screens working that out differently is how
 * "next week" comes to mean two different things on two tabs of the same app.
 *
 * Pure, so both the summary and the day-by-day view resolve a period the same
 * way and neither needs a browser to be tested.
 */

const ISO = 'yyyy-MM-dd';
const toIso = (date) => format(date, ISO);

const parseIso = (value) => {
  const parsed = parseISO(String(value ?? ''));
  return isValidDate(parsed) ? parsed : null;
};

const weekOf = (date) => startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });

/**
 * A period as the two dates every query below it takes.
 *
 * Throws on a mode it does not know rather than falling back: a caller reading
 * a hand-edited URL wants to decide what to do about it, and a silent default
 * inside here would hide the bad input from the one place that can.
 */
export function resolvePeriod({ mode, anchor = null, from = null, to = null }) {
  if (mode === PERIOD_MODE.WEEKLY) {
    const start = weekOf(parseIso(anchor) ?? new Date());
    return {
      mode,
      anchor: toIso(start),
      from: toIso(start),
      to: toIso(endOfWeek(start, { weekStartsOn: WEEK_STARTS_ON })),
    };
  }

  if (mode === PERIOD_MODE.MONTHLY) {
    const start = startOfMonth(parseIso(anchor) ?? new Date());
    return {
      mode,
      anchor: toIso(start),
      from: toIso(start),
      to: toIso(endOfMonth(start)),
    };
  }

  if (mode === PERIOD_MODE.CUSTOM) {
    const start = parseIso(from);
    const end = parseIso(to);

    if (!start || !end) {
      throw new Error('A custom period needs both a from and a to date.');
    }
    if (differenceInCalendarDays(end, start) < 0) {
      throw new Error('A custom period cannot end before it starts.');
    }

    return { mode, anchor: null, from: toIso(start), to: toIso(end) };
  }

  throw new Error(`Unknown period mode: ${mode}`);
}

/**
 * The same period, `delta` steps away.
 *
 * A custom range steps by its own length, so consecutive steps tile rather
 * than overlap — stepping a 30-day range forward gives the next 30 days, not
 * the next month.
 */
export function shiftPeriod(period, delta) {
  const { mode } = period;

  if (mode === PERIOD_MODE.WEEKLY) {
    const start = weekOf(parseIso(period.anchor) ?? new Date());
    return resolvePeriod({ mode, anchor: toIso(addWeeks(start, delta)) });
  }

  if (mode === PERIOD_MODE.MONTHLY) {
    const start = startOfMonth(parseIso(period.anchor) ?? new Date());
    return resolvePeriod({ mode, anchor: toIso(addMonths(start, delta)) });
  }

  const resolved = resolvePeriod(period);
  const start = parseIso(resolved.from);
  const end = parseIso(resolved.to);
  const length = differenceInCalendarDays(end, start) + 1;

  return resolvePeriod({
    mode: PERIOD_MODE.CUSTOM,
    from: toIso(addDays(start, length * delta)),
    to: toIso(addDays(end, length * delta)),
  });
}

/**
 * The period as a reader would say it out loud.
 *
 * A range inside one month names the month once — "17 – 23 August 2026" rather
 * than repeating it — because the repetition is what makes a date range hard
 * to scan.
 */
export function periodLabel(period) {
  const { mode, from, to } = resolvePeriod(period);

  if (mode === PERIOD_MODE.MONTHLY) return format(parseIso(from), 'MMMM yyyy');

  const start = parseIso(from);
  const end = parseIso(to);

  const sameMonth =
    format(start, 'yyyy-MM') === format(end, 'yyyy-MM')
      ? format(start, 'd')
      : format(start, 'd MMMM');

  return `${sameMonth} – ${format(end, 'd MMMM yyyy')}`;
}

/**
 * A period out of what the URL carries, defaulting to the current month.
 *
 * A hand-edited URL is a wrong input rather than a crash: the filter is a view
 * of the data, and refusing to render one is worse for the reader than showing
 * them this month and letting them re-pick.
 *
 * `today` is injected so the default is testable without freezing the clock.
 */
export function periodFromSearchParams(params = {}, { today = null } = {}) {
  const now = parseIso(today) ?? new Date();
  const fallback = { mode: PERIOD_MODE.MONTHLY, anchor: toIso(now) };

  /**
   * A bare from-and-to with no mode is a custom range.
   *
   * `/reports?from=&to=` redirects here carrying its query, and the range was
   * the whole point of that link. Defaulting it to this month would answer a
   * different question from the one asked, silently.
   */
  const mode =
    params?.mode ??
    (params?.from && params?.to ? PERIOD_MODE.CUSTOM : PERIOD_MODE.MONTHLY);

  const asked = {
    mode,
    anchor: params?.anchor ?? toIso(now),
    from: params?.from ?? null,
    to: params?.to ?? null,
  };

  let period;
  try {
    period = resolvePeriod(asked);
  } catch {
    period = resolvePeriod(fallback);
  }

  return { ...period, query: periodQuery(period) };
}

/** The period as the query parameters a link has to carry to reproduce it. */
export function periodQuery(period) {
  if (period.mode === PERIOD_MODE.CUSTOM) {
    return { mode: period.mode, from: period.from, to: period.to };
  }

  return { mode: period.mode, anchor: period.anchor };
}

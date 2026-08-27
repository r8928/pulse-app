/**
 * FR-3.13 and invariant I-5. What "required but not set" means, in one place.
 *
 * S-17 flags each gap inline beside the field; S-05 queues the same gaps in
 * Phase 6. Both call this, so the screen and the queue can never disagree
 * about whether a team is configured.
 *
 * Pure: it takes the team and its policy documents as arguments and fetches
 * nothing, the same rule every engine function follows (ARCHITECTURE 8.2).
 *
 * Nothing here supplies a fallback. `DC-6` forbids it, and a default that
 * looks reasonable is worse than a prompt, because nobody ever discovers it
 * was a guess.
 */

/**
 * Zero and false are set values, not absent ones. A team that allows no work
 * from home sets the quota to zero, and a plain falsy check would nag about it
 * forever — the classic defect this guards against.
 */
const isUnset = (value) =>
  value === undefined || value === null || value === '';

const isEmptyList = (value) => !Array.isArray(value) || value.length === 0;

/** Every figure in `teamPolicy` the engine cannot proceed without. */
const REQUIRED_POLICY_FIELDS = [
  ['leaveTypes', 'Leave types and their annual entitlement', isEmptyList],
  ['accrualPeriod', 'The period entitlement is credited over', isUnset],
  ['carryForward', 'Whether an unused balance carries forward', isUnset],
  [
    'automaticDeductionLeaveType',
    'The single leave type automatic deductions post to',
    isUnset,
  ],
  [
    'leaveDeductionLadder',
    'The bands deciding how much leave a late or short day costs',
    isEmptyList,
  ],
  ['ptoAwardLadder', 'The bands a PTO award is proposed from', isEmptyList],
  ['ptoValidityDays', 'How long a PTO award stays valid', isUnset],
  [
    'ctoApplicationLadder',
    'The lateness bands a CTO application is proposed from',
    isEmptyList,
  ],
  ['wfhQuotaDaysPerMonth', 'How many days may be worked from home', isUnset],
  [
    'shortDayThresholdPercent',
    'The share of the required duration below which a day is short',
    isUnset,
  ],
  [
    'holidayWorkThresholdPercent',
    'The share of the required duration that counts as holiday work',
    isUnset,
  ],
  [
    'midnightCrossingWindowHours',
    'How far past midnight a punch still belongs to the previous work date. spec.md gives no value for this, so it is asked for rather than guessed — a crossing shift cannot resolve a work date until it is set',
    isUnset,
  ],
  [
    'duplicatePunchWindowMinutes',
    'How close two punches of the same type must be to count as one. spec.md gives no value for this, so it is asked for rather than guessed — duplicates cannot be flagged until it is set',
    isUnset,
  ],
];

/**
 * Returns `[{ entity, field, why }]`, empty when the team is fully configured.
 *
 * `entity` names what to go and fix — the team, or the individual shift — so
 * the prompt is actionable without the reader having to work out where the
 * value lives.
 */
export function missingConfiguration({
  team,
  shifts = [],
  calendar,
  weeklyOffPattern,
  policy,
}) {
  const gaps = [];
  const teamName = team?.name ?? 'This team';

  const add = (entity, field, why) => gaps.push({ entity, field, why });

  // FR-3.1: exactly one manager. spec.md names one for a single seeded team,
  // so the rest are prompted for rather than invented (design record D-5).
  if (isUnset(team?.managerId)) {
    add(
      teamName,
      'managerId',
      'Every team has exactly one manager, and this one has none.',
    );
  }

  const liveShifts = shifts.filter((shift) => !shift.deletedAt);

  if (liveShifts.length === 0) {
    add(
      teamName,
      'shifts',
      'A tracked user needs a shift, and no day can be classified without one.',
    );
  }

  // FR-3.4: the shift a user takes when they hold none of their own.
  if (isUnset(team?.defaultShiftId)) {
    add(
      teamName,
      'defaultShiftId',
      'A user with no shift of their own takes the team default, and there is none to take.',
    );
  }

  for (const shift of liveShifts) {
    // FR-3.10 and DC-5: there is deliberately no company-wide timezone, so
    // nothing can fill this in.
    if (isUnset(shift.timezone)) {
      add(
        `Shift ${shift.name}`,
        'timezone',
        'Every timestamp resolves through the shift timezone, and there is no company-wide default to fall back on.',
      );
    }

    for (const [field, why] of [
      ['startTime', 'The shift has no start time.'],
      ['endTime', 'The shift has no end time.'],
      ['requiredDailyMinutes', 'Without it, no day can be judged short.'],
      ['graceMinutes', 'Without it, no arrival can be judged late.'],
    ]) {
      if (isUnset(shift[field])) add(`Shift ${shift.name}`, field, why);
    }
  }

  /**
   * FR-3.7 and FR-3.8. Two distinct causes with two distinct fixes, so two
   * distinct gaps: a team observing no calendar at all, and a calendar that
   * has never said which days are non-working. Neither is defaulted — a
   * fallback to Saturday and Sunday is the assumption FR-3.8 forbids (`D-29`).
   *
   * An empty `daysOfWeek` is a real answer — a calendar whose teams work every
   * day — so only the absence of a pattern counts.
   */
  if (!calendar) {
    add(
      teamName,
      'calendarId',
      'A team observes the holidays and the weekly off of the calendar it is assigned to, and this team is assigned to none.',
    );
  } else if (!weeklyOffPattern || !Array.isArray(weeklyOffPattern.daysOfWeek)) {
    add(
      `Calendar ${calendar.name}`,
      'weeklyOffPattern',
      'Which days are non-working is not assumed to be Saturday and Sunday.',
    );
  }

  for (const [field, why, absent] of REQUIRED_POLICY_FIELDS) {
    if (!policy || absent(policy[field])) add(teamName, field, why);
  }

  return gaps;
}

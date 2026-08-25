/**
 * Every domain enum in Pulse. No literal from this file may be typed inline
 * anywhere else in the application.
 *
 * What is NOT here, deliberately: leave types, entitlements, ladders,
 * thresholds and windows. FR-6.4 makes those configuration, stored as data and
 * editable at runtime with no redeploy. Putting them here would turn policy
 * back into code and break DC-1.
 */

// --- Access control --------------------------------------------------------

/**
 * The complete set. FR-1.3: a fifth role requires a schema change, and there is
 * never a second office-administration role.
 */
export const ROLES = Object.freeze({
  OFFICE_ADMIN: 'OFFICE_ADMIN',
  IT: 'IT',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
});

/** FR-1.2 ABAC: which records a permission reaches, checked per request. */
export const SCOPES = Object.freeze({
  SELF: 'SELF',
  TEAM: 'TEAM',
  ALL: 'ALL',
});

/** Widest first. Used to compare two scopes without a chain of conditionals. */
export const SCOPE_BREADTH = Object.freeze({
  [SCOPES.SELF]: 1,
  [SCOPES.TEAM]: 2,
  [SCOPES.ALL]: 3,
});

/**
 * The permission catalog. FR-1.2 stores each grant as data; these names are the
 * stable identifiers those grant records point at.
 *
 * Adding one here means OFFICE_ADMIN receives it at ALL automatically, per
 * FR-1.3's superset rule — enforced in the grant write path, not by convention.
 */
export const PERMISSIONS = Object.freeze({
  USER_READ: 'user.read',
  USER_WRITE: 'user.write',
  USER_IMPORT: 'user.import',

  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_WRITE: 'attendance.write',
  ATTENDANCE_IMPORT: 'attendance.import',

  LEAVE_READ: 'leave.read',
  LEAVE_WRITE: 'leave.write',
  LEAVE_APPROVE: 'leave.approve',

  PTO_READ: 'pto.read',
  PTO_APPROVE: 'pto.approve',

  TEAM_READ: 'team.read',
  TEAM_WRITE: 'team.write',

  CONFIG_READ: 'config.read',
  CONFIG_WRITE: 'config.write',

  PERMISSION_WRITE: 'permission.write',
  EXCEPTIONS_READ: 'exceptions.read',
  REPORT_BUILD: 'report.build',
  AUDIT_READ: 'audit.read',
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

// --- Users -----------------------------------------------------------------

/**
 * Seed values only. FR-2.6 makes employment types company-wide configuration,
 * and no permission depends on any of them. These names seed the collection.
 */
export const EMPLOYMENT_TYPE_SEEDS = Object.freeze({
  PERMANENT: 'PERMANENT',
  CONTRACT: 'CONTRACT',
  SUPPORT_STAFF: 'SUPPORT_STAFF',
  INTERN: 'INTERN',
});

/** FR-2.3: a restore must state which case applies; they behave differently. */
export const RESTORE_CASE = Object.freeze({
  CORRECTION: 'CORRECTION',
  REHIRE: 'REHIRE',
});

// --- Day classification ----------------------------------------------------

/** FR-5.2: what kind of date it is, from the team's calendar and pattern. */
export const DAY_TYPE = Object.freeze({
  WORKING: 'WORKING',
  WEEKLY_OFF: 'WEEKLY_OFF',
  HOLIDAY: 'HOLIDAY',
});

/**
 * FR-5.2: what the user actually did. Stored separately from day type, so a
 * report shows both what kind of date it was and what happened on it.
 *
 * The workbook's CWFO and CWFH both map onto HOLIDAY_WORK and are deliberately
 * not carried forward. Half a day of leave is LEAVE with a half-day amount on
 * the ledger, never a status of its own.
 */
export const DAY_STATUS = Object.freeze({
  WFO: 'WFO',
  WFH: 'WFH',
  LEAVE: 'LEAVE',
  HOLIDAY_WORK: 'HOLIDAY_WORK',
  WEEKLY_OFF: 'WEEKLY_OFF',
  HOLIDAY: 'HOLIDAY',
  ABSENT: 'ABSENT',
});

// --- Attendance ------------------------------------------------------------

export const PUNCH_TYPE = Object.freeze({
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
});

export const PUNCH_SOURCE = Object.freeze({
  FORM: 'FORM',
  IMPORT: 'IMPORT',
});

export const HOLIDAY_TYPE = Object.freeze({
  PUBLIC: 'PUBLIC',
  COMPANY: 'COMPANY',
});

/**
 * FR-8.6, §27.1: the codes the engine writes into `dayRecord.exceptions`.
 * Written starting Phase 5; read by the S-05 exceptions dashboard in Phase 6
 * (ARCHITECTURE.md §27.2 — derived every recalculation, not accumulated).
 */
export const EXCEPTION_CODE = Object.freeze({
  NO_SHIFT_ASSIGNED: 'NO_SHIFT_ASSIGNED',
  PUNCH_OUTSIDE_SHIFT_WINDOW: 'PUNCH_OUTSIDE_SHIFT_WINDOW',
  SHIFT_CONFIGURATION_INCOMPLETE: 'SHIFT_CONFIGURATION_INCOMPLETE',
  MISSING_CHECK_IN: 'MISSING_CHECK_IN',
  MISSING_CHECK_OUT: 'MISSING_CHECK_OUT',
  IMPOSSIBLE_DURATION: 'IMPOSSIBLE_DURATION',
});

/**
 * D-11 (docs/superpowers/specs/2026-08-13-phase-5-design.md). Which half of the
 * shift a half-day leave record covers, so lateness and the short-day test are
 * measured against the half the person was actually expected to work.
 */
export const HALF_DAY_PERIOD = Object.freeze({
  MORNING: 'MORNING',
  AFTERNOON: 'AFTERNOON',
});

// --- Ledger ----------------------------------------------------------------

/**
 * FR-6.8: balances are replayed from these and never stored. A movement is
 * cancelled by appending its reverse, never by editing the original.
 */
export const LEDGER_ENTRY_TYPE = Object.freeze({
  OPENING_BALANCE: 'OPENING_BALANCE',
  ENTITLEMENT_CREDIT: 'ENTITLEMENT_CREDIT',
  LEAVE_AVAILED: 'LEAVE_AVAILED',
  /**
   * D-13: FR-5.5's work-from-home usage, a plain count against BR-16's quota.
   * A quota is a ceiling rather than a pool drawn from a deposit, so this type
   * has no matching ENTITLEMENT_CREDIT.
   */
  WFH_USED: 'WFH_USED',
  AUTOMATIC_DEDUCTION: 'AUTOMATIC_DEDUCTION',
  CTO_APPLIED: 'CTO_APPLIED',
  PTO_AWARD: 'PTO_AWARD',
  PTO_TAKEN: 'PTO_TAKEN',
  PTO_EXPIRY: 'PTO_EXPIRY',
  LAPSED_ON_DEPARTURE: 'LAPSED_ON_DEPARTURE',
  REVERSAL: 'REVERSAL',
});

/**
 * The period a screen is filtered to. Weekly and monthly resolve their range
 * from a single anchor date; custom carries both ends itself.
 *
 * An enum rather than three strings spelled out at each call site: the summary
 * and the day-by-day view both read it out of the URL, and a typo in one of
 * them would silently fall back to the default month instead of failing.
 */
export const PERIOD_MODE = Object.freeze({
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  CUSTOM: 'CUSTOM',
});

/**
 * A week runs Monday to Sunday. `date-fns` defaults to Sunday, so every call
 * that resolves a week passes this rather than relying on the default.
 */
export const WEEK_STARTS_ON = 1;

/** FR-7.6: where a credit came from when no ladder row produced it. */
export const MANUAL_GRANT = 'MANUAL_GRANT';

// --- Workflow --------------------------------------------------------------

export const APPROVAL_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
});

/**
 * `FR-8.6`'s twelve queues, §27.1's table as an enum. The dashboard, the API
 * and the home-page counts all name a queue by one of these, so a tab can
 * never disagree with the count beside it about what it is showing.
 */
export const EXCEPTION_QUEUE = Object.freeze({
  MISSING_PUNCH: 'MISSING_PUNCH',
  DUPLICATE_PUNCH: 'DUPLICATE_PUNCH',
  IMPOSSIBLE_DURATION: 'IMPOSSIBLE_DURATION',
  NO_SHIFT: 'NO_SHIFT',
  CONFIGURATION: 'CONFIGURATION',
  IMPORT_ROW: 'IMPORT_ROW',
  LATE_ARRIVAL: 'LATE_ARRIVAL',
  EXHAUSTED_BALANCE: 'EXHAUSTED_BALANCE',
  PTO_EXPIRING: 'PTO_EXPIRING',
  PTO_PENDING: 'PTO_PENDING',
  CTO_PENDING: 'CTO_PENDING',
  REDUCTION: 'REDUCTION',
});

/** What an `approvals` document is about. FR-2.11 is the only kind today. */
export const APPROVAL_TYPE = Object.freeze({
  EMPLOYMENT_PERIOD_REDUCTION: 'EMPLOYMENT_PERIOD_REDUCTION',
});

/**
 * FR-2.11's three ways an employment period shrinks. The queue names the
 * change that caused it, so `IT` knows which thing to correct on a rejection.
 */
export const REDUCTION_CHANGE = Object.freeze({
  USER_SOFT_DELETED: 'USER_SOFT_DELETED',
  TENURE_SOFT_DELETED: 'TENURE_SOFT_DELETED',
  DATE_OF_LEAVING_MOVED: 'DATE_OF_LEAVING_MOVED',
});

/**
 * What a ledger entry, or an FR-2.11 stranded-record reference, points back
 * at. These strings are written into stored documents, so they are a domain
 * enum like any other rather than incidental text.
 */
export const RECORD_SOURCE = Object.freeze({
  DAY_RECORD: 'dayRecord',
  PUNCH: 'punch',
  LEAVE_RECORD: 'leaveRecord',
  PTO_AWARD: 'ptoAward',
  CTO_APPLICATION: 'ctoApplication',
  TENURE: 'tenure',
  CUTOVER: 'cutover',
  ENTITLEMENT_OVERRIDE: 'entitlementOverride',
});

// --- Sign in ---------------------------------------------------------------

/**
 * FR-1.5 and S-01: five distinct reasons, never one generic failure. A user
 * turned away must be able to tell which of these applies to them.
 */
export const SIGNIN_REJECTION = Object.freeze({
  UNAUTHORISED_DOMAIN: 'UNAUTHORISED_DOMAIN',
  NO_MATCHING_USER: 'NO_MATCHING_USER',
  USER_SOFT_DELETED: 'USER_SOFT_DELETED',
  LOGIN_DISABLED: 'LOGIN_DISABLED',
  OUTSIDE_EMPLOYMENT_PERIOD: 'OUTSIDE_EMPLOYMENT_PERIOD',
});

// --- Sentinels -------------------------------------------------------------

/**
 * A select showing "no team yet" needs a value that is not an id and not the
 * empty string, so an unset choice is never mistaken for a real assignment.
 */
export const UNASSIGNED = '__UNASSIGNED__';

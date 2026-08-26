import {
  addDays,
  format,
  isValid as isValidDate,
  parseISO,
  subDays,
} from 'date-fns';
import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  APPROVAL_STATUS,
  APPROVAL_TYPE,
  DAY_STATUS,
  DAY_TYPE,
  HALF_DAY_PERIOD,
  HOLIDAY_TYPE,
  LEDGER_ENTRY_TYPE,
  MANUAL_GRANT,
  PUNCH_SOURCE,
  PUNCH_TYPE,
  RECORD_SOURCE,
  RESTORE_CASE,
  ROLES,
  SCOPES,
} from './constants/index.js';
import {
  deriveEmploymentDates,
  isWithinEmploymentPeriod,
} from './utils/employment.js';
import { ledgerEffectKey } from './utils/ledgerKey.js';
import { missingConfiguration } from './utils/policyCompleteness.js';

/**
 * Every MongoDB query in Pulse. Nothing in `page.js`, an API route, or a
 * component may talk to the driver directly — they import from here.
 *
 * Three record classes behave differently (NFR-9, DC-3):
 *
 *   working records   punches, day records, users, tenures, shifts,
 *                     calendars, configuration — edited in place, soft deleted
 *   ledger entries    never edited, never deleted, never soft deleted;
 *                     cancelled only by appending a reversing entry
 *   audit records     append only
 *
 * No endpoint hard-deletes a user, an attendance record, or a leave record,
 * because no code path reachable from one exists (FR-2.2, MVP criterion 14).
 * The single exception is `purgeSeedUsers`, which is seed maintenance: it is
 * imported by `scripts/` alone, never by a route, page or component.
 */

// --- Connection ------------------------------------------------------------

/**
 * Cached across hot reloads. Next.js re-evaluates modules on every edit in
 * development, and a fresh MongoClient per reload exhausts the connection pool
 * within a few minutes of ordinary work.
 */
const globalForMongo = globalThis;

function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.',
    );
  }

  if (!globalForMongo.__pulseMongoClient) {
    globalForMongo.__pulseMongoClient = new MongoClient(uri).connect();
  }

  return globalForMongo.__pulseMongoClient;
}

export async function getDb() {
  const dbName = process.env.MONGODB_DB;
  if (!dbName) {
    throw new Error(
      'MONGODB_DB is not set. Copy .env.example to .env.local and fill it in.',
    );
  }

  const client = await getClient();
  return client.db(dbName);
}

// --- Collections -----------------------------------------------------------

/**
 * Every entity the spec names, created from day one. The calculation engine,
 * attendance capture and reporting are not built yet, but their collections
 * exist so shipping them needs no migration.
 */
export const COLLECTIONS = Object.freeze({
  // Identity
  USERS: 'users',
  TENURES: 'tenures',
  PERMISSION_GRANTS: 'permissionGrants',
  AUTHORISED_DOMAINS: 'authorisedDomains',

  // Organisation
  TEAMS: 'teams',
  SHIFTS: 'shifts',
  SHIFT_ASSIGNMENTS: 'shiftAssignments',
  TEAM_ASSIGNMENTS: 'teamAssignments',
  HOLIDAYS: 'holidays',
  WEEKLY_OFF_PATTERNS: 'weeklyOffPatterns',
  TEAM_POLICY: 'teamPolicy',
  EMPLOYMENT_TYPES: 'employmentTypes',

  // Attendance
  PUNCHES: 'punches',
  DAY_RECORDS: 'dayRecords',

  // Balances
  LEDGER_ENTRIES: 'ledgerEntries',
  LEAVE_RECORDS: 'leaveRecords',
  PTO_AWARDS: 'ptoAwards',
  CTO_APPLICATIONS: 'ctoApplications',

  // Workflow
  APPROVALS: 'approvals',
  IMPORT_EXCEPTIONS: 'importExceptions',
  AUDIT_RECORDS: 'auditRecords',
});

/**
 * DC-12 requires multi-tenancy in the schema from day one so Phase 2 needs no
 * migration. Until a company switcher ships there is exactly one, and every
 * document carries its id.
 */
export const DEFAULT_COMPANY_ID = 'default';

// --- Errors ----------------------------------------------------------------

/**
 * NFR-14 and DC-9: two OFFICE_ADMIN users working the same period is the
 * normal case, so a write against a stale version is rejected and the caller
 * is shown the current state rather than silently overwriting.
 */
export class StaleWriteError extends Error {
  constructor(current) {
    super('This record changed since you loaded it.');
    this.name = 'StaleWriteError';
    this.current = current;
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// --- Schemas ---------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD');

/**
 * FR-2.6. Work email is optional and unique where present — support staff hold
 * none and never sign in. Employee code is required and unique across all
 * users including soft deleted ones, so a departed user's records are never
 * reattached to a new joiner.
 */
export const userInputSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  employeeCode: z.string().trim().min(1, 'Employee code is required'),
  workEmail: z.email().nullable().optional(),
  /**
   * A contact detail, stored exactly as it is written.
   *
   * No shape is checked beyond it being text. Numbers arrive as
   * `+92 300 1234567`, as `0300-1234567` and as a bare extension, and there is
   * no format the company has agreed on — validating one here would be
   * inventing it. Nothing in the engine reads this and no permission depends
   * on it, so a wrong number costs a phone call, not an access decision.
   */
  phone: z.string().trim().max(40).nullable().optional(),
  teamId: z.string().nullable().optional(),
  employmentType: z.string().min(1, 'Employment type is required'),
  tracked: z.boolean(),
  loginEnabled: z.boolean(),
  role: z.enum(Object.values(ROLES)),
  shiftId: z.string().nullable().optional(),
  dateOfJoining: isoDate,
});

export const softDeleteUserSchema = z.object({
  dateOfLeaving: isoDate,
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const restoreUserSchema = z
  .object({
    restoreCase: z.enum(Object.values(RESTORE_CASE)),
    startDate: isoDate.nullable().optional(),
    reason: z.string().trim().min(1, 'A reason is required'),
  })
  .refine(
    (value) =>
      value.restoreCase !== RESTORE_CASE.REHIRE || Boolean(value.startDate),
    { message: 'A re-hire requires a start date for the new tenure' },
  );

/**
 * FR-3.1 and FR-3.2. A team is company-wide configuration with exactly one
 * manager. Both the manager and the default shift may be unset while the team
 * is being set up — `policyCompleteness` flags each until they are, rather
 * than either being guessed (`DC-6`, design record D-5).
 */
export const teamSchema = z.object({
  name: z.string().trim().min(1, 'A name is required'),
  managerId: z.string().nullable().optional(),
  defaultShiftId: z.string().nullable().optional(),
});

/** A 24-hour clock time. A shift ending before it starts crosses midnight. */
const clockTime = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    'Enter a time as HH:MM on a 24-hour clock',
  );

/**
 * FR-3.3 and FR-3.4. Named shifts are per team, and the timezone is required
 * because there is no company-wide default to fall back on (FR-3.10, DC-5).
 */
export const shiftSchema = z.object({
  teamId: z.string().min(1, 'A shift belongs to a team'),
  name: z.string().trim().min(1, 'A name is required'),
  startTime: clockTime,
  endTime: clockTime,
  requiredDailyMinutes: z
    .number()
    .int()
    .positive('Enter the required duration'),
  graceMinutes: z.number().int().min(0, 'Grace cannot be negative'),
  timezone: z
    .string()
    .trim()
    .min(1, 'A timezone is required — there is no company-wide default'),
});

/** FR-3.7. Typed, so nothing about a calendar depends on formatting or colour. */
export const holidaySchema = z.object({
  teamId: z.string().min(1, 'A holiday belongs to a team'),
  date: isoDate,
  name: z.string().trim().min(1, 'A name is required'),
  type: z.enum(Object.values(HOLIDAY_TYPE)),
});

/**
 * FR-3.8. Sunday is 0 through Saturday 6, matching `Date#getDay`. An empty
 * list is a real answer — a team that works every day — so it is accepted.
 */
export const weeklyOffPatternSchema = z.object({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6, 'A day of week runs 0 to 6'))
    .refine((days) => new Set(days).size === days.length, {
      message: 'A day cannot be listed twice',
    }),
});

/**
 * FR-6.4, the per-team half. Every field is optional because a policy is built
 * up tab by tab on S-17 and `policyCompleteness` reports what is still
 * outstanding — an unset value is prompted for, never defaulted (`DC-6`).
 */
const percentage = z.number().min(0).max(100);

export const teamPolicySchema = z.object({
  leaveTypes: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        annualEntitlement: z.number().min(0),
        consumesStandardBalance: z.boolean().optional(),
      }),
    )
    .optional(),
  accrualPeriod: z.string().trim().min(1).optional(),
  carryForward: z.boolean().optional(),
  automaticDeductionLeaveType: z.string().trim().min(1).optional(),
  leaveDeductionLadder: z.array(z.object({}).loose()).optional(),
  ptoAwardLadder: z.array(z.object({}).loose()).optional(),
  ptoValidityDays: z.number().int().min(0).optional(),
  ctoApplicationLadder: z.array(z.object({}).loose()).optional(),
  wfhQuotaDaysPerMonth: z.number().min(0).optional(),
  shortDayThresholdPercent: percentage.optional(),
  holidayWorkThresholdPercent: percentage.optional(),
  midnightCrossingWindowHours: z.number().min(0).max(24).optional(),
  duplicatePunchWindowMinutes: z.number().min(0).optional(),
  /**
   * D-27: an operational UX parameter, not a legal or financial figure
   * carried over from the workbook, so — unlike the two fields above —
   * this is seeded rather than left for policyCompleteness to flag.
   */
  ptoExpiryWarningDays: z.number().int().min(0).optional(),
});

/** FR-2.6: employment types are company-wide configuration, not an enum. */
export const employmentTypeSchema = z.object({
  name: z.string().trim().min(1, 'A name is required'),
});

/**
 * FR-1.5. A Workspace domain, not an email address — the likeliest mistake is
 * pasting a whole address, which would authorise nobody and be hard to spot.
 * A bare hostname is refused for the same reason: it can never be the domain
 * half of a work email.
 */
export const authorisedDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      'Enter a domain such as example.com, not an email address',
    ),
});

/**
 * FR-1.2. One cell of the S-19 matrix.
 *
 * A null scope means the role holds the permission at no scope — a row, never
 * a removed one (design record D-8), so nothing is destroyed and the change
 * has a real before and after to audit.
 */
export const permissionGrantSchema = z.object({
  role: z.enum(Object.values(ROLES)),
  permission: z.enum(ALL_PERMISSIONS),
  scope: z.enum(Object.values(SCOPES)).nullable(),
});

/** FR-4.10: every soft delete states its reason, recorded in the audit log. */
export const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

/**
 * FR-4.1. A punch is one instant and one direction — the fact. Everything
 * else about it (its work date, whether it is a duplicate) is a conclusion the
 * engine reaches later and rewrites freely, so none of it is accepted from the
 * writer.
 */
export const punchSchema = z.object({
  userId: z.string().min(1),
  at: z.coerce.date(),
  type: z.enum(Object.values(PUNCH_TYPE)),
  source: z.enum(Object.values(PUNCH_SOURCE)),
});

/**
 * FR-4.12: a wrong punch is fixed by editing it. All three fields are
 * editable, because all three can be wrong on an imported row — the time, the
 * direction, or the person it was recorded against.
 */
export const punchPatchSchema = z
  .object({
    at: z.coerce.date().optional(),
    type: z.enum(Object.values(PUNCH_TYPE)).optional(),
    userId: z.string().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.at || value.type || value.userId, {
    message: 'Nothing to change — supply a time, a type or a user.',
  });

/**
 * D-9. A leave record is a genuine engine INPUT, read the way a punch is —
 * not an override of what the engine concluded. FR-6.2 makes the type
 * mandatory; BR-11 makes a full day deduct one day of it.
 *
 * D-11: a half day carries the period it covers, because "late" is
 * meaningless without knowing which half the person was expected to work.
 */
export const leaveRecordSchema = z
  .object({
    userId: z.string().min(1),
    date: isoDate,
    leaveType: z.string().trim().min(1, 'A leave type is required'),
    amount: z.union([z.literal(1), z.literal(0.5)]),
    halfDayPeriod: z.enum(Object.values(HALF_DAY_PERIOD)).nullable().optional(),
    reason: z.string().trim().min(1, 'A reason is required'),
  })
  .refine((value) => value.amount !== 0.5 || Boolean(value.halfDayPeriod), {
    message: 'A half day of leave must say which half — morning or afternoon.',
  })
  .refine((value) => value.amount !== 1 || !value.halfDayPeriod, {
    message: 'A full day of leave covers both halves, so it takes no period.',
  });

/**
 * FR-6.10's day-level overrides: P-23 sets a status, P-24 corrects the hours,
 * P-25 waives a late arrival or short day. Any subset of the computed block,
 * always with a reason (FR-9.4 — the why is as auditable as the what).
 */
export const dayOverrideSchema = z
  .object({
    dayStatus: z.enum(Object.values(DAY_STATUS)).optional(),
    workedMinutes: z.number().min(0).optional(),
    lateMinutes: z.number().min(0).optional(),
    deduction: z.number().min(0).optional(),
    reason: z.string().trim().min(1, 'A reason is required'),
  })
  .refine(
    (value) =>
      value.dayStatus !== undefined ||
      value.workedMinutes !== undefined ||
      value.lateMinutes !== undefined ||
      value.deduction !== undefined,
    { message: 'An override must change at least one value.' },
  );

/**
 * The calendar day before a `YYYY-MM-DD` date, used to close an assignment's
 * range the day before its successor opens so the two never overlap.
 *
 * Shared by the team and shift assignment writers — the same rule for both,
 * so it exists once (CLAUDE.md).
 */
const dayBefore = (date) => format(subDays(parseISO(date), 1), 'yyyy-MM-dd');

const parse = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return result.data;
};

/**
 * MongoDB reports a unique-index violation as error code 11000, which would
 * otherwise reach `errorResponse` as an unknown error and become a 500. Every
 * uniqueness rule in the spec requires the offending value to be *named* —
 * FR-2.6 for an employee code, FR-3.2 for a team — so it is translated here
 * into the same ValidationError a Zod failure produces.
 */
function rethrowDuplicateAs(error, message) {
  if (error?.code === 11000) throw new ValidationError(message);
  throw error;
}

// --- Indexes ---------------------------------------------------------------

/**
 * Run by the seed script. NFR-5 sizes for 1000 users and 5 years of history,
 * and NFR-3 requires a full-company month under 2 seconds at p95, which these
 * are what make possible.
 */
export async function ensureIndexes() {
  const db = await getDb();

  await db.collection(COLLECTIONS.USERS).createIndexes([
    // Unique across all users including soft deleted ones (FR-2.6).
    { key: { companyId: 1, employeeCode: 1 }, unique: true },
    // Partial, because many users legitimately have no work email.
    {
      key: { companyId: 1, workEmail: 1 },
      unique: true,
      partialFilterExpression: { workEmail: { $type: 'string' } },
    },
    { key: { companyId: 1, deletedAt: 1, fullName: 1 } },
    { key: { companyId: 1, teamId: 1 } },
  ]);

  await db
    .collection(COLLECTIONS.TENURES)
    .createIndexes([{ key: { companyId: 1, userId: 1, startDate: 1 } }]);

  await db
    .collection(COLLECTIONS.PERMISSION_GRANTS)
    .createIndexes([
      { key: { companyId: 1, role: 1, permission: 1 }, unique: true },
    ]);

  await db
    .collection(COLLECTIONS.AUTHORISED_DOMAINS)
    .createIndexes([{ key: { companyId: 1, domain: 1 }, unique: true }]);

  // FR-2.6: two employment types of the same name are indistinguishable on
  // every screen that offers them, so the name is the natural key.
  await db
    .collection(COLLECTIONS.EMPLOYMENT_TYPES)
    .createIndexes([{ key: { companyId: 1, name: 1 }, unique: true }]);

  await db.collection(COLLECTIONS.TEAMS).createIndexes([
    /**
     * `key` is the seed's idempotency key and nothing else — it is null for
     * every team an administrator creates, which is why the index is partial.
     * Teams are referenced by `_id` everywhere; a key is never a foreign key.
     */
    {
      key: { companyId: 1, key: 1 },
      unique: true,
      partialFilterExpression: { key: { $type: 'string' } },
    },
    { key: { companyId: 1, deletedAt: 1, name: 1 } },
  ]);

  await db.collection(COLLECTIONS.SHIFTS).createIndexes([
    {
      key: { companyId: 1, key: 1 },
      unique: true,
      partialFilterExpression: { key: { $type: 'string' } },
    },
    { key: { companyId: 1, teamId: 1, deletedAt: 1 } },
  ]);

  await db
    .collection(COLLECTIONS.HOLIDAYS)
    .createIndexes([{ key: { companyId: 1, teamId: 1, date: 1 } }]);

  await db
    .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
    .createIndexes([{ key: { companyId: 1, teamId: 1 }, unique: true }]);

  await db
    .collection(COLLECTIONS.TEAM_POLICY)
    .createIndexes([{ key: { companyId: 1, teamId: 1 }, unique: true }]);

  await db
    .collection(COLLECTIONS.AUDIT_RECORDS)
    .createIndexes([
      { key: { companyId: 1, at: -1 } },
      { key: { companyId: 1, entityType: 1, entityId: 1, at: -1 } },
      { key: { companyId: 1, actorId: 1, at: -1 } },
    ]);

  await db
    .collection(COLLECTIONS.PUNCHES)
    .createIndexes([
      { key: { companyId: 1, userId: 1, workDate: 1 } },
      { key: { companyId: 1, workDate: 1 } },
    ]);

  await db
    .collection(COLLECTIONS.DAY_RECORDS)
    .createIndexes([
      { key: { companyId: 1, userId: 1, date: 1 }, unique: true },
      { key: { companyId: 1, date: 1 } },
    ]);

  await db.collection(COLLECTIONS.LEAVE_RECORDS).createIndexes([
    { key: { companyId: 1, userId: 1, date: 1 } },
    /**
     * D-9: two conflicting leave facts for one date is not a real state — the
     * same reasoning `createHoliday` already applies to one team observing two
     * holidays on one date. Partial on `deletedAt: null` so a cancelled record
     * never blocks the corrected one that replaces it.
     */
    {
      key: { companyId: 1, userId: 1, date: 1 },
      unique: true,
      partialFilterExpression: { deletedAt: null },
      name: 'leave_record_one_per_date',
    },
  ]);

  /**
   * D-21: one LIVE candidate per user per date. Nothing here is ever soft
   * deleted; a declined candidate is a genuine, permanent outcome that must
   * not block a fresh proposal once the day changes (`D-22`, `FR-7.8`).
   *
   * Partial on `declined: false` rather than on `status: { $ne: 'DECLINED' }`
   * — MongoDB's `partialFilterExpression` accepts only equality expressions,
   * `$exists`, the range operators and `$type`; `$ne` (and `$in`) are
   * rejected. The ledger's own `effectKey` index works around the identical
   * limitation by testing a field's absence; this document is never absent
   * the field, so a plain boolean equality does the same job.
   */
  await db.collection(COLLECTIONS.PTO_AWARDS).createIndexes([
    { key: { companyId: 1, userId: 1, status: 1 } },
    { key: { companyId: 1, status: 1, expiresAt: 1 } },
    {
      key: { companyId: 1, userId: 1, date: 1 },
      unique: true,
      partialFilterExpression: { declined: false },
      name: 'pto_award_one_live_per_date',
    },
  ]);

  await db.collection(COLLECTIONS.CTO_APPLICATIONS).createIndexes([
    { key: { companyId: 1, userId: 1, status: 1 } },
    {
      key: { companyId: 1, userId: 1, date: 1 },
      unique: true,
      partialFilterExpression: { declined: false },
      name: 'cto_application_one_live_per_date',
    },
  ]);

  await db.collection(COLLECTIONS.LEDGER_ENTRIES).createIndexes([
    // Balance replay: every entry for a user up to a date (BR-14).
    { key: { companyId: 1, userId: 1, date: 1 } },

    /**
     * Idempotency guard (NFR-15, invariant I-9). Two entries sharing an effect
     * key are the same movement recomputed, so the second insert is refused
     * and a re-run cannot double-post. See `utils/ledgerKey.js` for why the
     * source version is part of that key.
     *
     * This index must exist BEFORE the first ledger entry is written. Adding
     * it afterwards fails if duplicates already exist, and duplicates cannot
     * be deleted — a ledger entry is cancelled only by a reversing entry
     * (FR-6.8, DC-3). Retrofitting would mean permanently polluting the ledger
     * with reversals for rows that should never have existed.
     *
     * Partial on `effectKey` being a string, because reversal entries
     * deliberately carry none: a movement may legitimately be reversed and
     * re-applied. `$ne` is not permitted in a partialFilterExpression, so
     * absence of the field is what excludes them.
     */
    {
      key: { companyId: 1, userId: 1, effectKey: 1 },
      unique: true,
      partialFilterExpression: { effectKey: { $type: 'string' } },
      name: 'ledger_effect_idempotency',
    },
  ]);

  await db
    .collection(COLLECTIONS.APPROVALS)
    .createIndexes([{ key: { companyId: 1, status: 1, raisedAt: -1 } }]);

  await db
    .collection(COLLECTIONS.IMPORT_EXCEPTIONS)
    .createIndexes([{ key: { companyId: 1, resolved: 1, importedAt: -1 } }]);
}

// --- Audit -----------------------------------------------------------------

/**
 * FR-9.1, FR-9.2, FR-9.3. Append only: there is no update or delete function
 * for this collection anywhere in the file, and none may be added.
 */
export async function writeAuditRecord({
  actorId,
  actorName,
  action,
  entityType,
  entityId,
  before = null,
  after = null,
  reason = null,
  companyId = DEFAULT_COMPANY_ID,
}) {
  const db = await getDb();
  await db.collection(COLLECTIONS.AUDIT_RECORDS).insertOne({
    companyId,
    actorId,
    actorName,
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    before,
    after,
    reason,
    at: new Date(),
  });
}

/** FR-1.6: every authentication event, successful or failed. */
export async function recordSignInAttempt({ email, allowed, reason }) {
  await writeAuditRecord({
    actorId: null,
    actorName: email,
    action: allowed ? 'SIGN_IN_SUCCEEDED' : 'SIGN_IN_REJECTED',
    entityType: 'session',
    entityId: null,
    after: { email, allowed, reason: reason ?? null },
  });
}

// --- Configuration reads ---------------------------------------------------

/** FR-1.5: the Google Workspace domains permitted to sign in. */
export async function getAuthorisedDomains(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTIONS.AUTHORISED_DOMAINS)
    .find({ companyId, deletedAt: null })
    .toArray();

  return docs.map((doc) => doc.domain);
}

/**
 * FR-1.2: read per request, never cached in module scope. That is precisely
 * what makes an S-19 edit effective on the next request with no redeploy —
 * caching here would quietly break MVP criteria 4 and 7.
 */
export async function getPermissionGrants(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.PERMISSION_GRANTS)
    .find(
      { companyId },
      { projection: { _id: 0, role: 1, permission: 1, scope: 1 } },
    )
    .toArray();
}

// --- Users -----------------------------------------------------------------

const withTenures = (companyId) => [
  {
    $lookup: {
      from: COLLECTIONS.TENURES,
      let: { userId: { $toString: '$_id' } },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$userId', '$$userId'] },
            companyId,
          },
        },
        { $sort: { startDate: 1 } },
      ],
      as: 'tenures',
    },
  },
];

/**
 * The sign-in lookup. Returns the user with their tenures attached, because
 * FR-1.5 needs the employment period to decide, and a soft deleted user must
 * still be found so the rejection can say *why*.
 */
export async function findUserByWorkEmail(
  workEmail,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const [user] = await db
    .collection(COLLECTIONS.USERS)
    .aggregate([
      { $match: { companyId, workEmail: workEmail.toLowerCase() } },
      ...withTenures(companyId),
    ])
    .toArray();

  return user ?? null;
}

export async function getUserById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const [user] = await db
    .collection(COLLECTIONS.USERS)
    .aggregate([
      { $match: { companyId, _id: new ObjectId(id) } },
      ...withTenures(companyId),
    ])
    .toArray();

  return user ?? null;
}

/**
 * S-06. Paged rather than materialised whole (NFR-3, DC-10).
 *
 * FR-2.4: a soft deleted user stays listed and is marked no longer active, so
 * they are included by default and excluded only on request.
 */
/**
 * Several colleagues by id, in one read, name order.
 *
 * Soft-deleted ones are included deliberately: a screen showing a past period
 * has to show who was there then, marked as no longer active (FR-2.4). An id
 * that matches nobody is simply absent from the result rather than an error —
 * the caller is showing a roster, not asserting one exists.
 */
export async function listUsersByIds(userIds, companyId = DEFAULT_COMPANY_ID) {
  if (!userIds || userIds.length === 0) return [];

  const db = await getDb();
  const ids = userIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (ids.length === 0) return [];

  return db
    .collection(COLLECTIONS.USERS)
    .find({ companyId, _id: { $in: ids } })
    .sort({ fullName: 1 })
    .toArray();
}

export async function listUsers({
  search = '',
  teamId = null,
  role = null,
  employmentType = null,
  tracked = null,
  includeDeleted = true,
  page = 1,
  pageSize = 25,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();

  const filter = { companyId };
  if (!includeDeleted) filter.deletedAt = null;
  if (teamId) filter.teamId = teamId;
  if (role) filter.role = role;
  if (employmentType) filter.employmentType = employmentType;
  if (tracked !== null) filter.tracked = tracked;
  if (search.trim()) {
    const pattern = new RegExp(
      search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    filter.$or = [{ fullName: pattern }, { employeeCode: pattern }];
  }

  const collection = db.collection(COLLECTIONS.USERS);
  const [items, total, activeCount] = await Promise.all([
    collection
      .find(filter)
      // `_id` breaks the tie. Sorting on a non-unique field alone lets two
      // users with the same name repeat on one page and vanish from the next,
      // because the database is free to order equal keys differently per query.
      .sort({ fullName: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
    // FR-2.4: soft deleted users are excluded from counts of active users.
    collection.countDocuments({ companyId, deletedAt: null }),
  ]);

  return { items, total, activeCount, page, pageSize };
}

/**
 * FR-2.1. Creating a user opens their first tenure from the date of joining,
 * and writes both stored employment dates in the same operation so they cannot
 * drift from the tenures (FR-2.12).
 */
export async function createUser(input, actor, companyId = DEFAULT_COMPANY_ID) {
  const data = parse(userInputSchema, input);
  const db = await getDb();
  const now = new Date();

  const tenures = [
    { startDate: data.dateOfJoining, endDate: null, deletedAt: null },
  ];
  const { dateOfJoining, dateOfLeaving } = deriveEmploymentDates(tenures);

  const doc = {
    ...data,
    workEmail: data.workEmail ? data.workEmail.toLowerCase() : null,
    // '' means "they have no phone", which is not the same fact as an empty
    // string and must not be stored as one — the same rule work email takes.
    phone: data.phone || null,
    teamId: data.teamId ?? null,
    shiftId: data.shiftId ?? null,
    dateOfJoining,
    dateOfLeaving,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  const { insertedId } = await db.collection(COLLECTIONS.USERS).insertOne(doc);

  await db.collection(COLLECTIONS.TENURES).insertOne({
    companyId,
    userId: String(insertedId),
    startDate: data.dateOfJoining,
    endDate: null,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
  });

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

/**
 * Optimistic concurrency (NFR-14). The version the caller loaded is part of the
 * filter, so a concurrent edit means matchedCount is 0 and the caller gets the
 * current state to reconcile against rather than silently losing their change.
 */
async function updateWithVersion(
  collectionName,
  id,
  version,
  update,
  companyId,
) {
  const db = await getDb();
  const collection = db.collection(collectionName);

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), companyId, version },
    update,
    { returnDocument: 'after' },
  );

  if (!result) {
    const current = await collection.findOne({
      _id: new ObjectId(id),
      companyId,
    });
    throw new StaleWriteError(current);
  }

  return result;
}

export async function updateUser(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const data = parse(userInputSchema.partial(), patch);
  if (data.workEmail) data.workEmail = data.workEmail.toLowerCase();
  // Clearing the field means they have no number, not that they have ''.
  if (data.phone === '') data.phone = null;

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * FR-2.2. Soft delete is the only thing that closes a tenure, so a user who is
 * not soft deleted always has exactly one open tenure.
 *
 * Access is revoked immediately and never waits for the FR-2.11 approval of
 * any records left outside the reduced employment period.
 */
export async function softDeleteUser(
  id,
  input,
  actor,
  version,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(softDeleteUserSchema, input);
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const db = await getDb();
  const now = new Date();

  await db.collection(COLLECTIONS.TENURES).updateOne(
    { companyId, userId: String(id), endDate: null, deletedAt: null },
    {
      $set: {
        endDate: data.dateOfLeaving,
        updatedAt: now,
        updatedBy: actor.userId,
      },
    },
  );

  const tenures = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId: String(id) })
    .toArray();

  const { dateOfJoining, dateOfLeaving } = deriveEmploymentDates(tenures);

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: {
        deletedAt: now,
        dateOfJoining,
        dateOfLeaving,
        updatedAt: now,
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_SOFT_DELETED',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

/**
 * FR-2.3. Two cases which behave differently and must be stated:
 *
 *   CORRECTION  the soft delete was a mistake. The most recent tenure reopens
 *               by clearing its end date, leaving no gap.
 *   REHIRE      a new tenure opens from a supplied start date. The closed
 *               tenure stays closed and the gap stays outside the period.
 *
 * Both clear deletedAt and the date of leaving. A re-hire leaves the date of
 * joining unchanged, since that remains the date they first joined.
 */
export async function restoreUser(
  id,
  input,
  actor,
  version,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(restoreUserSchema, input);
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const db = await getDb();
  const now = new Date();
  const tenureCollection = db.collection(COLLECTIONS.TENURES);

  if (data.restoreCase === RESTORE_CASE.CORRECTION) {
    const [mostRecent] = await tenureCollection
      .find({ companyId, userId: String(id), deletedAt: null })
      .sort({ startDate: -1 })
      .limit(1)
      .toArray();

    if (mostRecent) {
      await tenureCollection.updateOne(
        { _id: mostRecent._id },
        { $set: { endDate: null, updatedAt: now, updatedBy: actor.userId } },
      );
    }
  } else {
    await tenureCollection.insertOne({
      companyId,
      userId: String(id),
      startDate: data.startDate,
      endDate: null,
      deletedAt: null,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
    });
  }

  const tenures = await tenureCollection
    .find({ companyId, userId: String(id) })
    .toArray();

  const { dateOfJoining, dateOfLeaving } = deriveEmploymentDates(tenures);

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: {
        deletedAt: null,
        dateOfJoining,
        dateOfLeaving,
        updatedAt: now,
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_RESTORED',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

// --- The user lifecycle, beyond create and delete ---------------------------

/** FR-1.7: one role at a time, and naming MANAGER names the team too. */
export const roleChangeSchema = z
  .object({
    role: z.enum(Object.values(ROLES)),
    teamId: z.string().nullable().optional(),
    reason: z.string().trim().min(1, 'A reason is required'),
  })
  .refine((value) => value.role !== ROLES.MANAGER || Boolean(value.teamId), {
    message:
      'Choosing MANAGER requires naming the team they will manage, so exactly one manager holds before and after.',
  });

/** FR-3.14: a move carries an effective date and never rewrites history. */
export const teamMoveSchema = z.object({
  teamId: z.string().min(1, 'A team is required'),
  effectiveFrom: isoDate,
  replacementManagerId: z.string().nullable().optional(),
  reason: z.string().trim().min(1, 'A reason is required'),
});

/** FR-3.6: a shift assignment is an effective date range, not a field. */
export const shiftAssignmentSchema = z
  .object({
    shiftId: z.string().min(1, 'A shift is required'),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().optional(),
    reason: z.string().trim().min(1, 'A reason is required'),
  })
  .refine(
    (value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom,
    { message: 'An assignment cannot end before it starts' },
  );

/** FR-2.10 and FR-1.5. Only these two fields are toggles. */
export const userFlagSchema = z.object({
  field: z.enum(['tracked', 'loginEnabled']),
  value: z.boolean(),
  reason: z.string().trim().min(1, 'A reason is required'),
});

/**
 * FR-2.12: a tenure is an unbroken period, open while still employed.
 *
 * The fields and the refinement are separate because Zod cannot take
 * `.partial()` of a refined schema, and an edit legitimately supplies only one
 * date. `endsAfterItStarts` is therefore applied to whichever shape is being
 * validated rather than baked into the object.
 */
const tenureFields = z.object({
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  reason: z.string().trim().min(1, 'A reason is required'),
});

const endsAfterItStarts = (value) =>
  !value.endDate || !value.startDate || value.endDate >= value.startDate;

const TENURE_ORDER_MESSAGE = {
  message: 'A tenure cannot end before it starts',
};

export const tenureSchema = tenureFields.refine(
  endsAfterItStarts,
  TENURE_ORDER_MESSAGE,
);

export const tenurePatchSchema = tenureFields
  .partial()
  .refine(endsAfterItStarts, TENURE_ORDER_MESSAGE);

/**
 * P-10. FR-1.7: a user holds exactly one role, and naming them MANAGER names
 * the team, replacing that team's previous manager in the same action so
 * FR-3.1 holds before and after.
 */
export async function changeUserRole(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(roleChangeSchema, input);
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const db = await getDb();
  const now = new Date();

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: {
        role: data.role,
        ...(data.role === ROLES.MANAGER ? { teamId: data.teamId } : {}),
        updatedAt: now,
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  if (data.role === ROLES.MANAGER) {
    // The team is the source of truth for who manages it. The outgoing
    // manager keeps their role — they may run another team, and demoting
    // somebody is a decision rather than a side effect of this one.
    await db
      .collection(COLLECTIONS.TEAMS)
      .updateOne(
        { _id: new ObjectId(data.teamId), companyId },
        { $set: { managerId: id, updatedAt: now, updatedBy: actor.userId } },
      );
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_ROLE_CHANGED',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

/**
 * Rows already sorted by user, as a map from user id to their rows.
 *
 * A user with no rows is absent from the map rather than present with an
 * empty array; every caller reads it through `?? []`, and inventing entries
 * for a roster of hundreds costs more than the fallback does.
 */
function groupByUser(rows) {
  const byUser = new Map();

  for (const row of rows) {
    const held = byUser.get(row.userId);
    if (held) held.push(row);
    else byUser.set(row.userId, [row]);
  }

  return byUser;
}

export async function listTeamAssignments(
  userId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.TEAM_ASSIGNMENTS)
    .find({ companyId, userId, deletedAt: null })
    .sort({ effectiveFrom: 1, _id: 1 })
    .toArray();
}

/** The same read for a whole roster at once, grouped by user. */
export async function listTeamAssignmentsForUsers(
  userIds,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTIONS.TEAM_ASSIGNMENTS)
    .find({ companyId, userId: { $in: userIds }, deletedAt: null })
    .sort({ userId: 1, effectiveFrom: 1, _id: 1 })
    .toArray();

  return groupByUser(rows);
}

/**
 * P-11. FR-3.14: an edit of the user's assignment, requiring no change to
 * either team.
 *
 * The outgoing assignment is closed the day before the new one opens, so no
 * date is covered twice and none is left uncovered — which is what lets the
 * engine resolve the team a user held on any past date.
 *
 * Where the user manages the team they are leaving, a replacement is named in
 * the same action; otherwise that team would be left with none.
 */
export async function moveUserTeam(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(teamMoveSchema, input);
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const db = await getDb();
  const now = new Date();

  const outgoing = before.teamId
    ? await db
        .collection(COLLECTIONS.TEAMS)
        .findOne({ _id: new ObjectId(before.teamId), companyId })
    : null;

  if (outgoing?.managerId === id && !data.replacementManagerId) {
    throw new ValidationError(
      `${before.fullName} manages ${outgoing.name}. Name a replacement manager in the same action, so that team is never left without one.`,
    );
  }

  await db.collection(COLLECTIONS.TEAM_ASSIGNMENTS).updateMany(
    { companyId, userId: id, effectiveTo: null, deletedAt: null },
    {
      $set: {
        effectiveTo: dayBefore(data.effectiveFrom),
        updatedAt: now,
        updatedBy: actor.userId,
      },
    },
  );

  // A user assigned before assignments were recorded has no open row to close,
  // so their previous team is written as a closed one rather than being lost.
  const openRows = await db
    .collection(COLLECTIONS.TEAM_ASSIGNMENTS)
    .countDocuments({ companyId, userId: id });

  if (openRows === 0 && before.teamId) {
    await db.collection(COLLECTIONS.TEAM_ASSIGNMENTS).insertOne({
      companyId,
      userId: id,
      teamId: before.teamId,
      effectiveFrom: before.dateOfJoining,
      effectiveTo: dayBefore(data.effectiveFrom),
      deletedAt: null,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
    });
  }

  await db.collection(COLLECTIONS.TEAM_ASSIGNMENTS).insertOne({
    companyId,
    userId: id,
    teamId: data.teamId,
    effectiveFrom: data.effectiveFrom,
    effectiveTo: null,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
  });

  if (data.replacementManagerId && outgoing) {
    await db.collection(COLLECTIONS.TEAMS).updateOne(
      { _id: outgoing._id, companyId },
      {
        $set: {
          managerId: data.replacementManagerId,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      },
    );
    await promoteToManager(data.replacementManagerId, actor, companyId);
  }

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: { teamId: data.teamId, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_TEAM_MOVED',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

export async function listShiftAssignments(
  userId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.SHIFT_ASSIGNMENTS)
    .find({ companyId, userId, deletedAt: null })
    .sort({ effectiveFrom: 1, _id: 1 })
    .toArray();
}

/**
 * P-12. FR-3.6: an effective date range, so a mid-year shift change is
 * preserved historically rather than overwriting the past.
 */
export async function assignUserShift(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(shiftAssignmentSchema, input);
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const db = await getDb();
  const now = new Date();

  /**
   * FR-3.6 means the PREVIOUS shift keeps its own range rather than being
   * overwritten — otherwise a punch from before the change resolves against a
   * shift the user was not on, and §13's work-date search silently produces
   * the wrong day.
   *
   * The same two steps `moveUserTeam` already performs for teams: close any
   * open row the day before the new one starts, and — for a user assigned
   * before assignments were recorded — write the shift they held as a closed
   * row rather than losing it.
   */
  await db.collection(COLLECTIONS.SHIFT_ASSIGNMENTS).updateMany(
    { companyId, userId: id, effectiveTo: null, deletedAt: null },
    {
      $set: {
        effectiveTo: dayBefore(data.effectiveFrom),
        updatedAt: now,
        updatedBy: actor.userId,
      },
    },
  );

  const existingRows = await db
    .collection(COLLECTIONS.SHIFT_ASSIGNMENTS)
    .countDocuments({ companyId, userId: id });

  if (existingRows === 0 && before.shiftId) {
    await db.collection(COLLECTIONS.SHIFT_ASSIGNMENTS).insertOne({
      companyId,
      userId: id,
      shiftId: before.shiftId,
      effectiveFrom: before.dateOfJoining,
      effectiveTo: dayBefore(data.effectiveFrom),
      deletedAt: null,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
    });
  }

  await db.collection(COLLECTIONS.SHIFT_ASSIGNMENTS).insertOne({
    companyId,
    userId: id,
    shiftId: data.shiftId,
    effectiveFrom: data.effectiveFrom,
    effectiveTo: data.effectiveTo ?? null,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
  });

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: { shiftId: data.shiftId, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_SHIFT_ASSIGNED',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

/**
 * P-13 and P-14. The two independent booleans of `FR-2.5`.
 *
 * One function rather than two, because the only difference between them is
 * the field name — and both are audited with a mandatory reason, delete no
 * history, and touch nothing else.
 */
export async function setUserFlag(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(userFlagSchema, input);
  const before = await getUserById(id, companyId);
  if (!before) return null;

  const after = await updateWithVersion(
    COLLECTIONS.USERS,
    id,
    version,
    {
      $set: {
        [data.field]: data.value,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action:
      data.field === 'tracked' ? 'USER_TRACKED_SET' : 'USER_LOGIN_ENABLED_SET',
    entityType: 'user',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

// --- Tenures ---------------------------------------------------------------

/**
 * Rewrites the two stored employment dates from whatever the tenures now say.
 *
 * FR-2.12 requires every operation that creates, edits, closes, soft deletes
 * or restores a tenure to write both in the same operation, so neither can
 * drift from the tenures they are derived from.
 */
async function rewriteEmploymentDates(userId, actor, companyId) {
  const db = await getDb();
  const tenures = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId })
    .toArray();

  const { dateOfJoining, dateOfLeaving } = deriveEmploymentDates(tenures);

  await db.collection(COLLECTIONS.USERS).updateOne(
    { _id: new ObjectId(userId), companyId },
    {
      $set: {
        dateOfJoining,
        dateOfLeaving,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      },
    },
  );
}

/** Two tenures of the same user may not overlap (`FR-2.12`). */
function assertNoOverlap(tenures, candidate, exceptId) {
  const start = candidate.startDate;
  const end = candidate.endDate ?? '9999-12-31';

  for (const existing of tenures) {
    if (existing.deletedAt) continue;
    if (exceptId && String(existing._id) === exceptId) continue;

    const otherStart = existing.startDate;
    const otherEnd = existing.endDate ?? '9999-12-31';

    if (start <= otherEnd && otherStart <= end) {
      throw new ValidationError(
        `This overlaps the tenure running from ${otherStart} to ${existing.endDate ?? 'now'}. Two tenures of the same user cannot overlap — a gap between them is what says they were not employed.`,
      );
    }
  }
}

/** P-17. Adds a tenure — a re-hire's earlier period, or a correction. */
export async function createTenure(
  userId,
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(userId)) return null;

  const data = parse(tenureSchema, input);
  const db = await getDb();

  const existing = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId })
    .toArray();

  assertNoOverlap(existing, data, null);

  const now = new Date();
  const doc = {
    companyId,
    userId,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
  };

  const { insertedId } = await db
    .collection(COLLECTIONS.TENURES)
    .insertOne(doc);

  await rewriteEmploymentDates(userId, actor, companyId);

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TENURE_CREATED',
    entityType: 'tenure',
    entityId: insertedId,
    after: doc,
    reason: data.reason,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

/**
 * P-17's edit. FR-2.12: editing corrects a wrong date but **cannot close an
 * open tenure** — an end date is set in one way only, by soft deleting the
 * user, which is what makes "one open tenure per serving user" hold.
 */
export async function updateTenure(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.TENURES)
    .findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const data = parse(tenurePatchSchema, patch);

  // An edit may move only the start, so the order check has to run against the
  // stored value rather than only against what was supplied.
  const proposedStart = data.startDate ?? before.startDate;
  const proposedEnd = data.endDate ?? before.endDate;
  if (proposedEnd && proposedEnd < proposedStart) {
    throw new ValidationError('A tenure cannot end before it starts');
  }

  if (before.endDate === null && data.endDate) {
    throw new ValidationError(
      'This tenure is open, and editing cannot close it. A date of leaving is set by soft deleting the user, which is the only thing that closes a tenure.',
    );
  }

  const siblings = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId: before.userId })
    .toArray();

  assertNoOverlap(
    siblings,
    {
      startDate: data.startDate ?? before.startDate,
      endDate: data.endDate ?? before.endDate,
    },
    id,
  );

  const after = await updateWithVersion(
    COLLECTIONS.TENURES,
    id,
    version,
    {
      $set: {
        ...(data.startDate ? { startDate: data.startDate } : {}),
        ...(data.endDate ? { endDate: data.endDate } : {}),
        updatedAt: new Date(),
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await rewriteEmploymentDates(before.userId, actor, companyId);

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TENURE_UPDATED',
    entityType: 'tenure',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * P-18. Refused when it is the user's last tenure that is not soft deleted:
 * `FR-2.12` says every user always keeps at least one.
 */
export async function softDeleteTenure(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.TENURES)
    .findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const remaining = await db
    .collection(COLLECTIONS.TENURES)
    .countDocuments({ companyId, userId: before.userId, deletedAt: null });

  if (remaining <= 1) {
    throw new ValidationError(
      'This is the last tenure this user has that is not soft deleted, and every user keeps at least one. Correct its dates instead.',
    );
  }

  const now = new Date();
  const after = await updateWithVersion(
    COLLECTIONS.TENURES,
    id,
    version,
    {
      $set: { deletedAt: now, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await rewriteEmploymentDates(before.userId, actor, companyId);

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TENURE_SOFT_DELETED',
    entityType: 'tenure',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

// --- Roster import ---------------------------------------------------------

/**
 * Every employee code in use, **including soft-deleted users** (`FR-2.6`).
 *
 * Loaded once as a set so the import validates 1000 rows in memory rather than
 * querying per row.
 */
export async function getAllEmployeeCodes(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTIONS.USERS)
    .find({ companyId })
    .project({ employeeCode: 1 })
    .toArray();

  return docs.map((doc) => doc.employeeCode);
}

/**
 * FR-2.9. Commits the roster: every accepted row becomes a user with their
 * first tenure open from the date of joining.
 *
 * **Atomic** — every row is written or none is. That is a guarantee about the
 * observable outcome rather than about the number of calls, so a partially
 * applied import must never be queryable. A transaction gives exactly that;
 * where the deployment has no replica set to support one, the whole import is
 * rejected rather than half-applied.
 */
export async function commitRosterImport(
  rows,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (rows.length === 0) {
    throw new ValidationError('There is nothing to import.');
  }

  const parsed = rows.map((row) => parse(userInputSchema, row));
  const client = await getClient();
  const session = client.startSession();
  const db = await getDb();
  const now = new Date();
  const created = [];

  try {
    await session.withTransaction(async () => {
      created.length = 0;

      for (const data of parsed) {
        const tenures = [
          { startDate: data.dateOfJoining, endDate: null, deletedAt: null },
        ];
        const { dateOfJoining, dateOfLeaving } = deriveEmploymentDates(tenures);

        const doc = {
          ...data,
          workEmail: data.workEmail ? data.workEmail.toLowerCase() : null,
          phone: data.phone || null,
          teamId: data.teamId ?? null,
          shiftId: data.shiftId ?? null,
          dateOfJoining,
          dateOfLeaving,
          companyId,
          deletedAt: null,
          version: 1,
          createdAt: now,
          createdBy: actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        };

        const { insertedId } = await db
          .collection(COLLECTIONS.USERS)
          .insertOne(doc, { session });

        await db.collection(COLLECTIONS.TENURES).insertOne(
          {
            companyId,
            userId: String(insertedId),
            startDate: data.dateOfJoining,
            endDate: null,
            deletedAt: null,
            version: 1,
            createdAt: now,
            createdBy: actor.userId,
          },
          { session },
        );

        created.push({ ...doc, _id: insertedId });
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ValidationError(
        'An employee code in this file is already in use. Nothing was imported — re-validate the file and try again.',
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }

  // Audited after the transaction commits, so the log never records an import
  // that was rolled back. One record for the import, one per user, because
  // both questions get asked: what happened, and to whom.
  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'ROSTER_IMPORTED',
    entityType: 'roster',
    entityId: null,
    after: { count: created.length },
    reason: 'Go-live migration from the Biometric ID sheet (FR-2.9).',
    companyId,
  });

  for (const user of created) {
    await writeAuditRecord({
      actorId: actor.userId,
      actorName: actor.name,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user._id,
      after: user,
      reason: 'Roster import',
      companyId,
    });
  }

  return { created: created.length };
}

// --- Approvals -------------------------------------------------------------

// --- Import exceptions -----------------------------------------------------

/**
 * `D-26`. `FR-8.6` lists "unmatched import row" among `S-05`'s queues, but
 * `S-11`'s preview is client-side and ephemeral: once the tab closes, a
 * rejected row has left no trace.
 *
 * Written at COMMIT only. An upload abandoned at the preview asserted nothing
 * and queues nothing — the row is a fact about a file somebody actually
 * imported, not about one they thought better of.
 */
export async function recordImportExceptions(
  rows,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (rows.length === 0) return { inserted: 0 };

  const db = await getDb();
  const now = new Date();

  const { insertedCount } = await db
    .collection(COLLECTIONS.IMPORT_EXCEPTIONS)
    .insertMany(
      rows.map((row) => ({
        companyId,
        sheetRow: row.sheetRow,
        employeeCode: row.employeeCode ?? null,
        fullName: row.fullName ?? null,
        reason: row.reason,
        importedAt: now,
        importedBy: actor.userId,
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
      })),
    );

  return { inserted: insertedCount };
}

/**
 * `resolved: null` asks for both. The default is the unresolved ones, because
 * that is what `S-05` queues — an acknowledged row is history.
 */
export async function listImportExceptions({
  resolved = false,
  page = 1,
  pageSize = 25,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (resolved !== null) filter.resolved = resolved;

  const collection = db.collection(COLLECTIONS.IMPORT_EXCEPTIONS);
  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ importedAt: -1, sheetRow: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total };
}

/**
 * There is nothing to approve or decline about a bad row — only to acknowledge
 * once the sheet or the roster is fixed and re-imported (`D-26`). Marked
 * rather than deleted: nothing in Pulse is ever purged (`NFR-9`).
 */
export async function resolveImportException(
  id,
  reason,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  parse(reasonSchema, { reason });
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.IMPORT_EXCEPTIONS);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const now = new Date();
  const after = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), companyId },
    {
      $set: {
        resolved: true,
        reason,
        resolvedAt: now,
        resolvedBy: actor.userId,
      },
    },
    { returnDocument: 'after' },
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'IMPORT_EXCEPTION_RESOLVED',
    entityType: 'importException',
    entityId: id,
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

/**
 * FR-2.11: a change reducing an employment period raises an approval naming
 * every record left outside it. Queued on S-05 until OFFICE_ADMIN decides.
 */
export async function listPendingApprovals(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.APPROVALS)
    .find({ companyId, status: APPROVAL_STATUS.PENDING })
    .sort({ raisedAt: -1 })
    .toArray();
}

export async function getApprovalById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection(COLLECTIONS.APPROVALS)
    .findOne({ _id: new ObjectId(id), companyId });
}

/**
 * One pending approval per user at a time, refreshed rather than duplicated.
 *
 * §27.2's rule bends here but does not break: the *decision* must persist, so
 * this is a stored record — but the stranded set inside it is a conclusion
 * about current state, so a second reduction (or a late import for a date the
 * user had already left) rewrites it rather than queueing the same person
 * twice with two different answers.
 */
export async function raiseReductionApproval(
  { userId, userName, change, records },
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.APPROVALS);
  const now = new Date();

  const existing = await collection.findOne({
    companyId,
    userId,
    type: APPROVAL_TYPE.EMPLOYMENT_PERIOD_REDUCTION,
    status: APPROVAL_STATUS.PENDING,
  });

  if (existing) {
    return collection.findOneAndUpdate(
      { _id: existing._id },
      {
        $set: { change, records, raisedAt: now, updatedAt: now },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
  }

  const doc = {
    companyId,
    type: APPROVAL_TYPE.EMPLOYMENT_PERIOD_REDUCTION,
    userId,
    userName,
    change,
    records,
    status: APPROVAL_STATUS.PENDING,
    reason: null,
    actorId: null,
    actorName: null,
    decidedAt: null,
    restoredAt: null,
    restoredBy: null,
    raisedAt: now,
    raisedBy: actor.userId,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  const { insertedId } = await collection.insertOne(doc);
  return { ...doc, _id: insertedId };
}

/** The version-checked write behind approve, reject and restore. */
export async function updateApprovalStatus(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const before = await getApprovalById(id, companyId);
  if (!before) return null;

  const { reason, action, ...fields } = patch;
  parse(reasonSchema, { reason });
  const now = new Date();

  const after = await updateWithVersion(
    COLLECTIONS.APPROVALS,
    id,
    version,
    {
      $set: {
        ...fields,
        actorId: actor.userId,
        actorName: actor.name,
        reason,
        updatedAt: now,
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action,
    entityType: 'approval',
    entityId: id,
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

/** Which collection an FR-2.11 stranded-record reference points at. */
const REDUCTION_COLLECTIONS = Object.freeze({
  [RECORD_SOURCE.DAY_RECORD]: COLLECTIONS.DAY_RECORDS,
  [RECORD_SOURCE.PUNCH]: COLLECTIONS.PUNCHES,
  [RECORD_SOURCE.LEAVE_RECORD]: COLLECTIONS.LEAVE_RECORDS,
});

/**
 * Every dated record a user holds, in the one shape `recordsOutsidePeriod`
 * judges. Soft-deleted ones are already out of every total, so they cannot be
 * stranded again.
 *
 * A punch is judged by its work date. One that has none belongs to no day yet
 * and the engine will never give it a date outside the period (§13 filters
 * `datesToVisit` by employment), so it is carried through with a null date and
 * the pure function drops it.
 */
export async function listUserDatedRecords(
  userId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const query = { companyId, userId, deletedAt: null };

  const [dayRecords, punches, leaveRecords] = await Promise.all([
    db.collection(COLLECTIONS.DAY_RECORDS).find(query).toArray(),
    db.collection(COLLECTIONS.PUNCHES).find(query).toArray(),
    db.collection(COLLECTIONS.LEAVE_RECORDS).find(query).toArray(),
  ]);

  return [
    ...dayRecords.map((record) => ({
      sourceType: RECORD_SOURCE.DAY_RECORD,
      _id: String(record._id),
      date: record.date,
    })),
    ...punches.map((punch) => ({
      sourceType: RECORD_SOURCE.PUNCH,
      _id: String(punch._id),
      date: punch.workDate ?? null,
    })),
    ...leaveRecords.map((record) => ({
      sourceType: RECORD_SOURCE.LEAVE_RECORD,
      _id: String(record._id),
      date: record.date,
    })),
  ];
}

/**
 * FR-2.11's approval and its later undo, as one storage operation.
 *
 * `deletedAt` is set or cleared in bulk — the decision is the audited event
 * (`updateApprovalStatus` writes that record), not each of the possibly
 * hundreds of rows it covers.
 */
export async function setReductionRecordsDeleted(
  records,
  deleted,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const now = new Date();
  let changed = 0;

  for (const [sourceType, collectionName] of Object.entries(
    REDUCTION_COLLECTIONS,
  )) {
    const ids = records
      .filter((record) => record.sourceType === sourceType)
      .map((record) => new ObjectId(record._id));

    if (ids.length === 0) continue;

    const { modifiedCount } = await db.collection(collectionName).updateMany(
      { _id: { $in: ids }, companyId },
      {
        $set: {
          deletedAt: deleted ? now : null,
          updatedAt: now,
          updatedBy: actor.userId,
        },
      },
    );

    changed += modifiedCount;
  }

  return { changed };
}

// --- Teams -----------------------------------------------------------------

/**
 * S-16. Each team with its manager, its default shift and how many people are
 * in it.
 *
 * The member count comes from the users assigned to the team, and excludes
 * soft-deleted ones: a count is a total, and totals exclude while rosters
 * include (`FR-2.4`).
 *
 * FR-3.2: a soft-deleted team stays readable, so past day records still
 * resolve through the calendar and policy it held. It is dropped from the
 * default list only because it is no longer offered for assignment.
 */
export async function listTeams({
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const match = { companyId };
  if (!includeDeleted) match.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.TEAMS)
    .aggregate([
      { $match: match },
      { $sort: { name: 1, _id: 1 } },
      {
        $lookup: {
          from: COLLECTIONS.USERS,
          let: { teamId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$teamId', '$$teamId'] },
                companyId,
                deletedAt: null,
              },
            },
            { $count: 'count' },
          ],
          as: 'members',
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.USERS,
          let: { managerId: '$managerId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: '$_id' }, '$$managerId'] },
                companyId,
              },
            },
            { $project: { fullName: 1 } },
          ],
          as: 'manager',
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.SHIFTS,
          let: { shiftId: '$defaultShiftId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: '$_id' }, '$$shiftId'] },
                companyId,
              },
            },
            { $project: { name: 1 } },
          ],
          as: 'defaultShift',
        },
      },
      {
        $addFields: {
          memberCount: { $ifNull: [{ $first: '$members.count' }, 0] },
          managerName: { $first: '$manager.fullName' },
          defaultShiftName: { $first: '$defaultShift.name' },
        },
      },
      { $project: { members: 0, manager: 0, defaultShift: 0 } },
    ])
    .toArray();

  return { items, total: items.length };
}

export async function getTeamById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  return db
    .collection(COLLECTIONS.TEAMS)
    .findOne({ _id: new ObjectId(id), companyId });
}

/**
 * Two teams of the same name are indistinguishable on every screen that offers
 * one, so a live duplicate is refused. This is checked here rather than by a
 * unique index because a soft-deleted team keeps its name forever, and that
 * must not stop the name being used again (`FR-3.2` keeps it readable, not
 * reserved).
 */
async function assertTeamNameFree(name, exceptId, companyId) {
  const db = await getDb();
  const clash = await db.collection(COLLECTIONS.TEAMS).findOne({
    companyId,
    name,
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: new ObjectId(exceptId) } } : {}),
  });

  if (clash) {
    throw new ValidationError(`A team named ${name} already exists.`);
  }
}

/**
 * FR-1.7 and FR-3.1. A team's manager holds the MANAGER role, so naming one
 * promotes them in the same operation and "exactly one manager" holds before
 * and after — whichever screen set it.
 *
 * The outgoing manager keeps their role: they may manage another team, and
 * demoting somebody silently is a decision, not a side effect. P-10 is where a
 * role is deliberately changed.
 */
async function promoteToManager(userId, actor, companyId) {
  if (!userId || !ObjectId.isValid(userId)) return;

  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.USERS)
    .findOne({ _id: new ObjectId(userId), companyId });

  if (!before || before.role === ROLES.MANAGER) return;

  const after = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
    { _id: new ObjectId(userId), companyId },
    {
      $set: {
        role: ROLES.MANAGER,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'USER_ROLE_CHANGED',
    entityType: 'user',
    entityId: userId,
    before,
    after,
    reason: 'Named as the manager of a team (FR-1.7, FR-3.1).',
    companyId,
  });
}

export async function createTeam(input, actor, companyId = DEFAULT_COMPANY_ID) {
  const data = parse(teamSchema, input);
  await assertTeamNameFree(data.name, null, companyId);

  const db = await getDb();
  const now = new Date();

  const doc = {
    name: data.name,
    key: null,
    managerId: data.managerId ?? null,
    defaultShiftId: data.defaultShiftId ?? null,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  const { insertedId } = await db.collection(COLLECTIONS.TEAMS).insertOne(doc);
  await promoteToManager(doc.managerId, actor, companyId);

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TEAM_CREATED',
    entityType: 'team',
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

export async function updateTeam(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const before = await getTeamById(id, companyId);
  if (!before) return null;

  const data = parse(teamSchema.partial(), patch);
  if (data.name) await assertTeamNameFree(data.name, id, companyId);

  const after = await updateWithVersion(
    COLLECTIONS.TEAMS,
    id,
    version,
    {
      $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  if (data.managerId && data.managerId !== before.managerId) {
    await promoteToManager(data.managerId, actor, companyId);
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TEAM_UPDATED',
    entityType: 'team',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * FR-3.2. Refused while any user who is not soft deleted is still assigned,
 * naming those users so they can be **moved** first — moved, not deleted. A
 * team with only past assignments may go.
 *
 * The team is never destroyed (`I-1`): it stays readable so historical day
 * records still resolve through the calendar, weekly off pattern and policy it
 * held, and is simply no longer offered for assignment.
 */
export async function softDeleteTeam(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const before = await getTeamById(id, companyId);
  if (!before) return null;

  const db = await getDb();
  const assigned = await db
    .collection(COLLECTIONS.USERS)
    .find({ companyId, teamId: id, deletedAt: null })
    .project({ fullName: 1 })
    .limit(10)
    .toArray();

  if (assigned.length > 0) {
    throw new ValidationError(
      `${before.name} still has ${assigned
        .map((member) => member.fullName)
        .join(
          ', ',
        )} assigned to it. Move them to another team first — soft deleting the team does not move or remove anybody.`,
    );
  }

  const now = new Date();
  const after = await updateWithVersion(
    COLLECTIONS.TEAMS,
    id,
    version,
    {
      $set: { deletedAt: now, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TEAM_SOFT_DELETED',
    entityType: 'team',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

// --- Per-team configuration ------------------------------------------------

/**
 * The shared shape of every per-team record: created with a version, soft
 * deleted rather than destroyed, and audited on every change.
 *
 * Extracted because shifts and holidays would otherwise be the same forty
 * lines twice, and the third such record would make it three.
 */
async function createOwnedRecord(
  collectionName,
  { data, action, entityType, companyId, actor },
) {
  const db = await getDb();
  const now = new Date();

  const doc = {
    ...data,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  const { insertedId } = await db.collection(collectionName).insertOne(doc);

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action,
    entityType,
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

async function softDeleteOwnedRecord(
  collectionName,
  { id, reason, version, action, entityType, companyId, actor },
) {
  const db = await getDb();
  const before = await db
    .collection(collectionName)
    .findOne({ _id: new ObjectId(id), companyId });

  if (!before) return null;

  const now = new Date();
  const after = await updateWithVersion(
    collectionName,
    id,
    version,
    {
      $set: { deletedAt: now, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action,
    entityType,
    entityId: id,
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

// --- Shifts ----------------------------------------------------------------

/** FR-3.3: shifts are per team configuration, not a global list. */
/**
 * Several shifts by id, in one read.
 *
 * A day record names the shift held on that date, and a screen showing a month
 * of them needs each one's timezone to print a punch in the zone it was made
 * in (§7.2). Reading them one at a time would be a round trip per row.
 */
export async function listShiftsByIds(
  shiftIds,
  companyId = DEFAULT_COMPANY_ID,
) {
  const ids = [...new Set(shiftIds ?? [])]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (ids.length === 0) return [];

  const db = await getDb();
  return db
    .collection(COLLECTIONS.SHIFTS)
    .find({ companyId, _id: { $in: ids } })
    .toArray();
}

export async function listShifts(
  teamId,
  { includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  const filter = { companyId, teamId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.SHIFTS)
    .find(filter)
    .sort({ startTime: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

/**
 * Every assignable team with the shifts that belong to it (`FR-3.3`).
 *
 * `P-08` offers a team and a shift in one dialog, and has to hold every
 * team's shifts before the reader has picked a team — so this is one read
 * rather than `listShifts` once per team, which would be a query per row of a
 * select that has not been opened yet.
 *
 * Only what may be assigned **now**: a soft deleted team or shift is excluded,
 * because `FR-2.4` keeps a soft deleted record readable everywhere it already
 * appears while never offering it as the subject of a new assignment. A team
 * with no shift yet is kept, not dropped — it is a team somebody still has to
 * configure, and the dialog can only say so if it can see it (`DC-6`).
 *
 * Ids come back as strings. `P-08` is a client component and an ObjectId does
 * not cross that boundary as itself.
 */
export async function listTeamsWithShifts(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();

  const teams = await db
    .collection(COLLECTIONS.TEAMS)
    .aggregate([
      { $match: { companyId, deletedAt: null } },
      { $sort: { name: 1, _id: 1 } },
      {
        $lookup: {
          from: COLLECTIONS.SHIFTS,
          // `teamId` is stored on a shift as a string, so the join compares
          // against the team's id converted to one rather than the ObjectId.
          let: { teamId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$teamId', '$$teamId'] },
                companyId,
                deletedAt: null,
              },
            },
            { $sort: { startTime: 1, _id: 1 } },
          ],
          as: 'shifts',
        },
      },
    ])
    .toArray();

  return teams.map((team) => ({
    _id: String(team._id),
    name: team.name,
    defaultShiftId: team.defaultShiftId ? String(team.defaultShiftId) : null,
    shifts: team.shifts.map((shift) => ({
      _id: String(shift._id),
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
    })),
  }));
}

export async function createShift(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return createOwnedRecord(COLLECTIONS.SHIFTS, {
    data: { ...parse(shiftSchema, input), key: null },
    action: 'SHIFT_CREATED',
    entityType: 'shift',
    companyId,
    actor,
  });
}

export async function updateShift(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.SHIFTS)
    .findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const data = parse(shiftSchema.partial(), patch);

  const after = await updateWithVersion(
    COLLECTIONS.SHIFTS,
    id,
    version,
    {
      $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'SHIFT_UPDATED',
    entityType: 'shift',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * FR-3.4: refused while it is the team's default. A user holding no shift of
 * their own takes that default, so removing it under them would leave the team
 * unable to classify a day at all — and `DC-6` forbids falling back to another.
 */
export async function softDeleteShift(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.SHIFTS)
    .findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const defaultFor = await db
    .collection(COLLECTIONS.TEAMS)
    .findOne({ companyId, defaultShiftId: id, deletedAt: null });

  if (defaultFor) {
    throw new ValidationError(
      `${before.name} is the default shift for ${defaultFor.name}. Point the team at another shift first — a user holding no shift of their own takes the default, and there is nothing to fall back to.`,
    );
  }

  return softDeleteOwnedRecord(COLLECTIONS.SHIFTS, {
    id,
    reason: data.reason,
    version,
    action: 'SHIFT_SOFT_DELETED',
    entityType: 'shift',
    companyId,
    actor,
  });
}

// --- Holidays --------------------------------------------------------------

/** FR-3.7: each team keeps its own calendar, so two observe different days. */
export async function listHolidays(
  teamId,
  { includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  const filter = { companyId, teamId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.HOLIDAYS)
    .find(filter)
    .sort({ date: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

export async function createHoliday(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(holidaySchema, input);
  const db = await getDb();

  const clash = await db.collection(COLLECTIONS.HOLIDAYS).findOne({
    companyId,
    teamId: data.teamId,
    date: data.date,
    deletedAt: null,
  });

  if (clash) {
    throw new ValidationError(
      `This team already observes ${clash.name} on ${data.date}. Edit that entry rather than adding a second one.`,
    );
  }

  return createOwnedRecord(COLLECTIONS.HOLIDAYS, {
    data,
    action: 'HOLIDAY_CREATED',
    entityType: 'holiday',
    companyId,
    actor,
  });
}

export async function updateHoliday(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.HOLIDAYS)
    .findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const data = parse(holidaySchema.partial(), patch);

  const after = await updateWithVersion(
    COLLECTIONS.HOLIDAYS,
    id,
    version,
    {
      $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'HOLIDAY_UPDATED',
    entityType: 'holiday',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

export async function softDeleteHoliday(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);

  return softDeleteOwnedRecord(COLLECTIONS.HOLIDAYS, {
    id,
    reason: data.reason,
    version,
    action: 'HOLIDAY_SOFT_DELETED',
    entityType: 'holiday',
    companyId,
    actor,
  });
}

// --- Weekly off pattern ----------------------------------------------------

export async function getWeeklyOffPattern(
  teamId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
    .findOne({ companyId, teamId });
}

/**
 * FR-3.8. Exactly one pattern per team, replaced in place.
 *
 * `version` is null the first time, when the team has no pattern yet — the
 * same shape `setPermissionGrant` uses for a cell with no row.
 */
export async function setWeeklyOffPattern(
  teamId,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(weeklyOffPatternSchema, input);
  const db = await getDb();
  const now = new Date();
  const before = await getWeeklyOffPattern(teamId, companyId);

  let after;

  if (!before) {
    const doc = {
      teamId,
      daysOfWeek: data.daysOfWeek,
      companyId,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };

    const { insertedId } = await db
      .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
      .insertOne(doc);
    after = { ...doc, _id: insertedId };
  } else {
    after = await updateWithVersion(
      COLLECTIONS.WEEKLY_OFF_PATTERNS,
      String(before._id),
      version,
      {
        $set: {
          daysOfWeek: data.daysOfWeek,
          updatedAt: now,
          updatedBy: actor.userId,
        },
        $inc: { version: 1 },
      },
      companyId,
    );
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'WEEKLY_OFF_PATTERN_SET',
    entityType: 'weeklyOffPattern',
    entityId: after._id,
    before,
    after,
    reason: input.reason ?? null,
    companyId,
  });

  return after;
}

// --- Team policy -----------------------------------------------------------

/**
 * FR-6.4 and I-3. Every ladder, threshold and window the engine reads at
 * calculation time. Absent until an administrator sets it — never defaulted.
 */
export async function getTeamPolicy(teamId, companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  return db.collection(COLLECTIONS.TEAM_POLICY).findOne({ companyId, teamId });
}

export async function updateTeamPolicy(
  teamId,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(teamPolicySchema, patch);
  const db = await getDb();
  const now = new Date();
  const before = await getTeamPolicy(teamId, companyId);

  let after;

  if (!before) {
    const doc = {
      ...data,
      teamId,
      companyId,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };

    const { insertedId } = await db
      .collection(COLLECTIONS.TEAM_POLICY)
      .insertOne(doc);
    after = { ...doc, _id: insertedId };
  } else {
    after = await updateWithVersion(
      COLLECTIONS.TEAM_POLICY,
      String(before._id),
      version,
      {
        $set: { ...data, updatedAt: now, updatedBy: actor.userId },
        $inc: { version: 1 },
      },
      companyId,
    );
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'TEAM_POLICY_UPDATED',
    entityType: 'teamPolicy',
    entityId: after._id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * Everything S-17 renders, in one read: the team, its shifts, its calendar,
 * its weekly off pattern, its policy, and every value still outstanding.
 *
 * The gaps come from `policyCompleteness`, which S-05 also calls in Phase 6 —
 * so the inline flag on this screen and the queued exception can never
 * disagree about whether a team is configured (`FR-3.13`).
 */
export async function getTeamConfiguration(
  teamId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const team = await getTeamById(teamId, companyId);
  if (!team) return null;

  const [shifts, holidays, weeklyOffPattern, policy] = await Promise.all([
    listShifts(teamId, { companyId }),
    listHolidays(teamId, { companyId }),
    getWeeklyOffPattern(teamId, companyId),
    getTeamPolicy(teamId, companyId),
  ]);

  return {
    team,
    shifts: shifts.items,
    holidays: holidays.items,
    weeklyOffPattern,
    policy,
    gaps: missingConfiguration({
      team,
      shifts: shifts.items,
      weeklyOffPattern,
      policy,
    }),
  };
}

// --- Permission grants -----------------------------------------------------

/**
 * S-19's read surface: whole documents, because the matrix needs each row's
 * version to write a cell back safely.
 *
 * `getPermissionGrants` above stays as it is — proxy.js and session.js call it
 * on every single request and want the lean projection.
 */
export async function listPermissionGrants(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  const items = await db
    .collection(COLLECTIONS.PERMISSION_GRANTS)
    .find({ companyId })
    .sort({ permission: 1, role: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

/**
 * P-42. Sets the scope one role holds one permission at.
 *
 * FR-1.3 is NOT enforced here. It is a rule about the whole matrix —
 * OFFICE_ADMIN's grants are a permanent superset — which no single cell can be
 * checked against in isolation, so the caller validates the resulting set with
 * `validateGrants` before calling in. Keeping that in the handler also keeps
 * this file free of an authz import, per the Part I dependency rules.
 *
 * A cell with no row yet is created, and `version` is null in that case. The
 * unique index on (companyId, role, permission) is what makes a concurrent
 * first write fail rather than duplicate.
 */
export async function setPermissionGrant(
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(permissionGrantSchema, input);
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.PERMISSION_GRANTS);
  const now = new Date();

  const before = await collection.findOne({
    companyId,
    role: data.role,
    permission: data.permission,
  });

  if (!before) {
    const doc = {
      ...data,
      companyId,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };

    let insertedId;
    try {
      ({ insertedId } = await collection.insertOne(doc));
    } catch (error) {
      rethrowDuplicateAs(
        error,
        'Another administrator changed this permission at the same moment. Reload to see the current state.',
      );
    }

    await writeAuditRecord({
      actorId: actor.userId,
      actorName: actor.name,
      action: 'PERMISSION_GRANT_CHANGED',
      entityType: 'permissionGrant',
      entityId: insertedId,
      before: null,
      after: doc,
      reason: input.reason ?? null,
      companyId,
    });

    return { ...doc, _id: insertedId };
  }

  const after = await updateWithVersion(
    COLLECTIONS.PERMISSION_GRANTS,
    String(before._id),
    version,
    {
      $set: { scope: data.scope, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'PERMISSION_GRANT_CHANGED',
    entityType: 'permissionGrant',
    entityId: String(before._id),
    before,
    after,
    reason: input.reason ?? null,
    companyId,
  });

  return after;
}

// --- Employment types ------------------------------------------------------

/**
 * FR-2.6 and FR-6.4. Company-wide configuration, editable at runtime.
 *
 * Unpaged deliberately: this list is bounded by configuration rather than by
 * the roster, so NFR-3 does not apply to it. Every collection that grows with
 * the roster pages.
 */
export async function listEmploymentTypes({
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.EMPLOYMENT_TYPES)
    .find(filter)
    .sort({ name: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

export async function createEmploymentType(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(employmentTypeSchema, input);
  const db = await getDb();
  const now = new Date();

  const doc = {
    ...data,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  let insertedId;
  try {
    ({ insertedId } = await db
      .collection(COLLECTIONS.EMPLOYMENT_TYPES)
      .insertOne(doc));
  } catch (error) {
    rethrowDuplicateAs(
      error,
      `An employment type named ${data.name} already exists.`,
    );
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'EMPLOYMENT_TYPE_CREATED',
    entityType: 'employmentType',
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

export async function updateEmploymentType(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.EMPLOYMENT_TYPES);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const data = parse(employmentTypeSchema, patch);

  let after;
  try {
    after = await updateWithVersion(
      COLLECTIONS.EMPLOYMENT_TYPES,
      id,
      version,
      {
        $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
        $inc: { version: 1 },
      },
      companyId,
    );
  } catch (error) {
    rethrowDuplicateAs(
      error,
      `An employment type named ${data.name} already exists.`,
    );
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'EMPLOYMENT_TYPE_UPDATED',
    entityType: 'employmentType',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * Rejected while any user who is not soft deleted still holds it, naming those
 * users so they can be moved first — the FR-3.2 rule for teams, applied to the
 * other company-wide list. A type held only by departed users may go, because
 * their records still resolve it by name.
 */
export async function softDeleteEmploymentType(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.EMPLOYMENT_TYPES);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const holders = await db
    .collection(COLLECTIONS.USERS)
    .find({ companyId, employmentType: before.name, deletedAt: null })
    .project({ fullName: 1 })
    .limit(10)
    .toArray();

  if (holders.length > 0) {
    throw new ValidationError(
      `${before.name} is still held by ${holders
        .map((holder) => holder.fullName)
        .join(
          ', ',
        )}. Move them to another employment type first — they are not deleted with it.`,
    );
  }

  const now = new Date();
  const after = await updateWithVersion(
    COLLECTIONS.EMPLOYMENT_TYPES,
    id,
    version,
    {
      $set: { deletedAt: now, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'EMPLOYMENT_TYPE_SOFT_DELETED',
    entityType: 'employmentType',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

// --- Authorised domains ----------------------------------------------------

/**
 * S-18's read surface: whole documents, so the screen can offer a versioned
 * removal. `getAuthorisedDomains` above stays as it is — the sign-in path wants
 * bare strings and must not pay for anything more.
 */
export async function listAuthorisedDomains({
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.AUTHORISED_DOMAINS)
    .find(filter)
    .sort({ domain: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

export async function createAuthorisedDomain(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(authorisedDomainSchema, input);
  const db = await getDb();
  const now = new Date();

  const doc = {
    ...data,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  let insertedId;
  try {
    ({ insertedId } = await db
      .collection(COLLECTIONS.AUTHORISED_DOMAINS)
      .insertOne(doc));
  } catch (error) {
    rethrowDuplicateAs(error, `${data.domain} is already authorised.`);
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'AUTHORISED_DOMAIN_ADDED',
    entityType: 'authorisedDomain',
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

/**
 * Refused when it is the last one. FR-1.5 admits a sign-in only from an
 * authorised domain, so an empty list is not a configuration state — it locks
 * every user out, including the OFFICE_ADMIN who would have to undo it, and
 * there is no signed-in surface left to undo it from.
 */
export async function softDeleteAuthorisedDomain(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.AUTHORISED_DOMAINS);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const remaining = await collection.countDocuments({
    companyId,
    deletedAt: null,
  });

  if (remaining <= 1) {
    throw new ValidationError(
      `${before.domain} is the last authorised domain. Removing it would prevent every user from signing in, including you. Add the replacement first.`,
    );
  }

  const now = new Date();
  const after = await updateWithVersion(
    COLLECTIONS.AUTHORISED_DOMAINS,
    id,
    version,
    {
      $set: { deletedAt: now, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'AUTHORISED_DOMAIN_REMOVED',
    entityType: 'authorisedDomain',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}

// --- Punches ---------------------------------------------------------------

export async function getPunchById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection(COLLECTIONS.PUNCHES)
    .findOne({ _id: new ObjectId(id), companyId });
}

/**
 * §13: a punch is found by its RESOLVED work date, not by the calendar date of
 * its instant — a night-shift check-out at 02:30 belongs to the previous day's
 * record. A punch whose work date has not been resolved yet matches nothing
 * here, which is correct: it has no day to belong to until the engine gives it
 * one.
 */
export async function listPunchesForUserDates(
  userId,
  dates,
  { includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  const filter = { companyId, userId, workDate: { $in: dates } };
  if (!includeDeleted) filter.deletedAt = null;

  return db
    .collection(COLLECTIONS.PUNCHES)
    .find(filter)
    .sort({ at: 1, _id: 1 })
    .toArray();
}

/** S-10: one work date, every user on one team. */
export async function listPunchesForWorkDate(
  workDate,
  {
    userIds = null,
    includeDeleted = false,
    companyId = DEFAULT_COMPANY_ID,
  } = {},
) {
  const db = await getDb();
  const filter = { companyId, workDate };
  if (userIds) filter.userId = { $in: userIds };
  if (!includeDeleted) filter.deletedAt = null;

  return db
    .collection(COLLECTIONS.PUNCHES)
    .find(filter)
    .sort({ at: 1, _id: 1 })
    .toArray();
}

/**
 * Every punch whose INSTANT falls in a window, whatever work date it carries.
 *
 * `recalculateDays` needs this to re-resolve work dates after a shift change
 * (§23.3 step 3): the punch it must revisit is by definition one whose stored
 * work date is now wrong, so filtering by that field would hide exactly the
 * rows it is looking for.
 */
export async function listPunchesInInstantRange(
  userId,
  from,
  to,
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.PUNCHES)
    .find({ companyId, userId, deletedAt: null, at: { $gte: from, $lte: to } })
    .sort({ at: 1, _id: 1 })
    .toArray();
}

/**
 * §25.4. A punch may not land outside its owner's employment period, nor on a
 * user nobody tracks — and each refusal states which of the two applies rather
 * than failing generically (FR-2.10, FR-2.12, DC-6).
 *
 * The instant's own calendar date is what is checked. The work date is not
 * known until the engine resolves it against a shift (§13), and a tenure
 * boundary is a day rather than an instant, so the two differ only for a punch
 * on the very edge of a crossing shift on someone's first or last day.
 *
 * Returns the user, or null when there is none — the caller answers 404, so
 * the existence of a record outside the viewer's reach is never leaked (§9.1).
 */
async function assertPunchTarget(userId, at, companyId) {
  const user = await getUserById(userId, companyId);
  if (!user) return null;

  if (!user.tracked) {
    throw new ValidationError(
      `${user.fullName} is not tracked, so no attendance is recorded for them.`,
    );
  }

  const db = await getDb();
  const tenures = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId, deletedAt: null })
    .toArray();

  const date = format(at, 'yyyy-MM-dd');

  if (!isWithinEmploymentPeriod(tenures, date)) {
    throw new ValidationError(
      `${date} is outside ${user.fullName}'s employment period, so no attendance can be recorded on it.`,
    );
  }

  return user;
}

export async function createPunch(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(punchSchema, input);

  const target = await assertPunchTarget(data.userId, data.at, companyId);
  if (!target) return null;

  return createOwnedRecord(COLLECTIONS.PUNCHES, {
    data: {
      ...data,
      workDate: null,
      workDateExceptionCode: null,
      isDuplicate: false,
      duplicateAcknowledgedAt: null,
      duplicateAcknowledgedBy: null,
      duplicateReason: null,
    },
    action: 'PUNCH_CREATED',
    entityType: 'punch',
    companyId,
    actor,
  });
}

/**
 * FR-4.12: a wrong punch is fixed by editing it. Never by adding a cancelling
 * punch, never by overriding the day. The caller recalculates BOTH the day it
 * left and the day it moved to.
 */
export async function updatePunch(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const before = await getPunchById(id, companyId);
  if (!before) return null;

  const { reason, ...changes } = parse(punchPatchSchema, patch);

  // FR-4.12: the same two refusals apply to where a punch MOVES to, not only
  // to where it was created.
  const target = await assertPunchTarget(
    changes.userId ?? before.userId,
    changes.at ?? before.at,
    companyId,
  );
  if (!target) return null;

  const now = new Date();

  const after = await updateWithVersion(
    COLLECTIONS.PUNCHES,
    id,
    version,
    {
      $set: { ...changes, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'PUNCH_UPDATED',
    entityType: 'punch',
    entityId: id,
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

/**
 * `P-07`, `FR-4.7`. The "keep" half: this pair is genuinely two taps, and the
 * queue should stop asking.
 *
 * The acknowledgement is stored BESIDE the engine's flag rather than clearing
 * it. `isDuplicate` is derived and rewritten by every recalculation, so
 * clearing it would last exactly until the next run and the queue would never
 * empty — the same reason `DC-7` puts a day override beside `computed` rather
 * than in place of it. `setPunchDerivedFields` never touches these fields, so
 * the decision survives.
 */
export async function acknowledgeDuplicatePunch(
  id,
  reason,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  parse(reasonSchema, { reason });
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.PUNCHES);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const now = new Date();
  const after = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), companyId },
    {
      $set: {
        duplicateAcknowledgedAt: now,
        duplicateAcknowledgedBy: actor.userId,
        duplicateReason: reason,
        updatedAt: now,
        updatedBy: actor.userId,
      },
    },
    { returnDocument: 'after' },
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'DUPLICATE_PUNCH_ACKNOWLEDGED',
    entityType: 'punch',
    entityId: id,
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

export async function softDeletePunch(
  id,
  reason,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  // FR-4.10: every soft delete states its reason, and the check belongs here
  // rather than in the route, so no second caller can skip it.
  parse(reasonSchema, { reason });

  return softDeleteOwnedRecord(COLLECTIONS.PUNCHES, {
    id,
    reason,
    version,
    action: 'PUNCH_SOFT_DELETED',
    entityType: 'punch',
    companyId,
    actor,
  });
}

/**
 * The engine's own write-back. Derived values only — a resolved work date, a
 * duplicate flag — so it deliberately writes no audit record and bumps no
 * version: nobody decided this, and a version bump would fire a spurious 409
 * at an administrator holding the punch (§6, §19.3).
 */
export async function setPunchDerivedFields(
  id,
  { workDate, workDateExceptionCode, isDuplicate },
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();

  await db
    .collection(COLLECTIONS.PUNCHES)
    .updateOne(
      { _id: new ObjectId(id), companyId },
      { $set: { workDate, workDateExceptionCode, isDuplicate } },
    );
}

// --- Day records -----------------------------------------------------------

export async function getDayRecord(
  userId,
  date,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.DAY_RECORDS)
    .findOne({ companyId, userId, date, deletedAt: null });
}

export async function listDayRecords({
  userIds = null,
  from,
  to,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId, deletedAt: null, date: { $gte: from, $lte: to } };
  if (userIds) filter.userId = { $in: userIds };

  return db
    .collection(COLLECTIONS.DAY_RECORDS)
    .find(filter)
    .sort({ date: 1, userId: 1 })
    .toArray();
}

/**
 * The bookends of every work date in a range, for every colleague at once.
 *
 * The first check-in and the last check-out, so a day broken by a lunch break
 * reads as one span rather than two — the day-by-day view is answering "when
 * did they arrive and when did they leave", which the middle pairs do not
 * change. `punchPairs.js` remains the place that reasons about the pairs
 * themselves.
 *
 * Only dated punches take part. One the engine has not resolved a work date
 * for belongs to no day yet, and guessing one here would put it under a
 * heading the rest of the app disagrees with.
 */
export async function summarisePunchDays({
  userIds,
  from,
  to,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();

  const rows = await db
    .collection(COLLECTIONS.PUNCHES)
    .aggregate([
      {
        $match: {
          companyId,
          deletedAt: null,
          userId: { $in: userIds },
          workDate: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: { userId: '$userId', date: '$workDate' },
          checkIn: {
            $min: {
              $cond: [{ $eq: ['$type', PUNCH_TYPE.CHECK_IN] }, '$at', null],
            },
          },
          checkOut: {
            $max: {
              $cond: [{ $eq: ['$type', PUNCH_TYPE.CHECK_OUT] }, '$at', null],
            },
          },
          punchCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.userId': 1, '_id.date': 1 } },
    ])
    .toArray();

  return rows.map((row) => ({
    userId: row._id.userId,
    date: row._id.date,
    // A day with only a check-in keeps its arrival and reports no departure.
    // FR-4.8 makes the missing counterpart an exception, never zero hours, so
    // the column says nothing rather than saying midnight.
    checkIn: row.checkIn ?? null,
    checkOut: row.checkOut ?? null,
    punchCount: row.punchCount,
  }));
}

/** Every colleague's leave inside a range, in one read. */
export async function listLeaveRecords({
  userIds,
  from,
  to,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();

  return db
    .collection(COLLECTIONS.LEAVE_RECORDS)
    .find({
      companyId,
      deletedAt: null,
      userId: { $in: userIds },
      date: { $gte: from, $lte: to },
    })
    .sort({ date: 1, userId: 1, _id: 1 })
    .toArray();
}

/**
 * Every ledger entry several colleagues hold up to a closing date, oldest
 * first — the batched form of `listLedgerEntriesForUser`.
 *
 * The order is the contract, not a convenience: the caller accumulates a
 * running balance through it, and a different order gives a different figure
 * for the same day. Entries are never soft deleted (DC-3 cancels by appending
 * a reversal), so there is no `deletedAt` filter to omit.
 */
export async function listLedgerEntriesForUsers({
  userIds,
  to = null,
  leaveType = null,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId, userId: { $in: userIds } };

  if (to) filter.date = { $lte: to };
  if (leaveType) filter.leaveType = leaveType;

  return db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .find(filter)
    .sort({ userId: 1, date: 1, createdAt: 1, _id: 1 })
    .toArray();
}

/**
 * §27.1's day-level queues, all four of them, in one paged read.
 *
 * §27.2: **derive, do not accumulate.** These are conclusions living on the
 * day record, rewritten by every recalculation — so fixing the punch empties
 * the queue with no separate cleanup, and nothing here can drift from what
 * `S-10` and `S-12` show for the same day.
 *
 * `matchOverride` narrows further where the queue is not a code but a state:
 * an unresolved late arrival is a deduction nobody has waived, which is a
 * condition on `computed` and `override` rather than on `exceptions`.
 */
export async function listDayRecordExceptions({
  codes = null,
  matchExtra = null,
  from,
  to,
  userIds = null,
  page = 1,
  pageSize = 25,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = {
    companyId,
    deletedAt: null,
    date: { $gte: from, $lte: to },
    ...(matchExtra ?? {}),
  };
  if (codes) filter.exceptions = { $in: codes };
  if (userIds) filter.userId = { $in: userIds };

  const collection = db.collection(COLLECTIONS.DAY_RECORDS);
  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ date: -1, userId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total };
}

/** FR-4.7's queue. A punch the engine flagged and nobody has resolved. */
export async function listDuplicatePunches({
  from,
  to,
  page = 1,
  pageSize = 25,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = {
    companyId,
    deletedAt: null,
    isDuplicate: true,
    // P-07's "keep": a decision that this pair is genuinely two taps. Stored
    // beside the derived flag, so it survives the recalculation that rewrites
    // that flag and the queue stops asking.
    duplicateAcknowledgedAt: null,
    workDate: { $gte: from, $lte: to },
  };

  const collection = db.collection(COLLECTIONS.PUNCHES);
  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ workDate: -1, at: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total };
}

/** The scalar fields whose change makes a recalculation a real change. */
const DAY_RECORD_COMPARED = ['teamId', 'shiftId', 'dayType'];

const sameComputed = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

/**
 * Order carries no meaning in an exceptions list — it is a set of conclusions
 * about the day, so a reordering is not a new conclusion (§27.2).
 */
const sameExceptions = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((code, index) => code === right[index]);
};

/**
 * §23.3 step 11 and §19.3's requirement on the caller: when nothing changed,
 * write NOTHING. A spurious version bump would mint a fresh effectKey and let
 * a re-run post the same movement twice, and would fire a stale-write 409 at
 * anyone else holding the record.
 *
 * The override is never part of what this writes (I-6, FR-6.12) — it is set
 * only by `setDayOverride`, and a recalculation refreshes `computed` beneath
 * it without ever reading it.
 */
export async function upsertDayRecord(
  { userId, date, teamId, shiftId, dayType, computed, exceptions },
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const existing = await getDayRecord(userId, date, companyId);
  const now = new Date();

  if (!existing) {
    const doc = {
      companyId,
      userId,
      date,
      teamId,
      shiftId,
      dayType,
      computed,
      override: null,
      exceptions,
      version: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await db
      .collection(COLLECTIONS.DAY_RECORDS)
      .insertOne(doc);

    return { record: { ...doc, _id: insertedId }, changed: true };
  }

  const incoming = { teamId, shiftId, dayType };
  const unchanged =
    DAY_RECORD_COMPARED.every((field) => existing[field] === incoming[field]) &&
    sameComputed(existing.computed, computed) &&
    sameExceptions(existing.exceptions, exceptions);

  if (unchanged) return { record: existing, changed: false };

  const record = await db.collection(COLLECTIONS.DAY_RECORDS).findOneAndUpdate(
    { _id: existing._id, companyId },
    {
      $set: { teamId, shiftId, dayType, computed, exceptions, updatedAt: now },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );

  return { record, changed: true };
}

/**
 * P-23, P-24, P-25. FR-6.11: the new value sits BESIDE the engine's, with who,
 * why and when. There is no separate override record and the computed block is
 * never touched here.
 */
export async function setDayOverride(
  userId,
  date,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const before = await getDayRecord(userId, date, companyId);
  if (!before) return null;

  const { reason, ...values } = parse(dayOverrideSchema, input);
  const now = new Date();

  const after = await updateWithVersion(
    COLLECTIONS.DAY_RECORDS,
    String(before._id),
    version,
    {
      $set: {
        override: {
          ...values,
          reason,
          actorId: actor.userId,
          actorName: actor.name,
          at: now,
        },
        updatedAt: now,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'DAY_OVERRIDE_SET',
    entityType: 'dayRecord',
    entityId: String(before._id),
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

/** Removing a human decision is itself a decision, so it takes a reason too. */
export async function clearDayOverride(
  userId,
  date,
  reason,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const before = await getDayRecord(userId, date, companyId);
  if (!before) return null;

  parse(reasonSchema, { reason });
  const now = new Date();

  const after = await updateWithVersion(
    COLLECTIONS.DAY_RECORDS,
    String(before._id),
    version,
    { $set: { override: null, updatedAt: now }, $inc: { version: 1 } },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'DAY_OVERRIDE_CLEARED',
    entityType: 'dayRecord',
    entityId: String(before._id),
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

// --- Recalculation inputs --------------------------------------------------

/**
 * §23.3 step 1: the team held ON that date, not the user's current one. A
 * report of March must not change because someone moved team in June —
 * FR-3.14 says a team move never rewrites history.
 */
export function resolveTeamOnDate(
  teamAssignments,
  date,
  fallbackTeamId = null,
) {
  const covering = teamAssignments.find(
    (assignment) =>
      assignment.effectiveFrom <= date &&
      (assignment.effectiveTo === null || assignment.effectiveTo >= date),
  );

  return covering?.teamId ?? fallbackTeamId ?? null;
}

/** FR-2.10: an untracked user receives no day records, so none is recalculated. */
export async function listTrackedUserIds({
  teamId = null,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId, deletedAt: null, tracked: true };
  if (teamId) filter.teamId = teamId;

  const users = await db
    .collection(COLLECTIONS.USERS)
    .find(filter, { projection: { _id: 1 } })
    .toArray();

  return users.map((user) => String(user._id));
}

/**
 * The first and last dates this user has any attendance activity on.
 *
 * An open-ended recalculation range has to stop somewhere. "From this date
 * forward", which a team move or policy change produces (FR-3.14), needs an
 * end; a policy edit with no effective date at all needs both. There is
 * nothing to recompute outside the span of what was actually recorded.
 *
 * Deriving the bounds from the data rather than from the clock also keeps the
 * result deterministic, which NFR-8 requires of a re-run over a past period.
 */
export async function activityDateRange(
  userId,
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();

  const edge = async (collection, field, direction) => {
    const [row] = await db
      .collection(collection)
      .find({ companyId, userId, [field]: { $ne: null } })
      .sort({ [field]: direction })
      .limit(1)
      .toArray();

    return row?.[field] ?? null;
  };

  const newest = (collection, field) => edge(collection, field, -1);
  const oldest = (collection, field) => edge(collection, field, 1);

  /**
   * A punch's work date is resolved BY a recalculation, so a punch that has
   * never been through one carries none — and bounding the range by work date
   * alone would skip the very punches an open-ended run exists to pick up. Its
   * instant is the fallback, and a day is added because a shift in a timezone
   * ahead of UTC can carry a punch into the following work date.
   */
  const punchEdge = async (direction) => {
    const [row] = await db
      .collection(COLLECTIONS.PUNCHES)
      .find({ companyId, userId, deletedAt: null })
      .sort({ at: direction })
      .limit(1)
      .toArray();

    return row?.at ?? null;
  };

  const newestPunch = await punchEdge(-1);
  const oldestPunch = await punchEdge(1);

  const upper = [
    await newest(COLLECTIONS.DAY_RECORDS, 'date'),
    await newest(COLLECTIONS.PUNCHES, 'workDate'),
    await newest(COLLECTIONS.LEAVE_RECORDS, 'date'),
    newestPunch ? format(addDays(newestPunch, 1), 'yyyy-MM-dd') : null,
  ].filter(Boolean);

  const lower = [
    await oldest(COLLECTIONS.DAY_RECORDS, 'date'),
    await oldest(COLLECTIONS.PUNCHES, 'workDate'),
    await oldest(COLLECTIONS.LEAVE_RECORDS, 'date'),
    oldestPunch ? format(subDays(oldestPunch, 1), 'yyyy-MM-dd') : null,
  ].filter(Boolean);

  return {
    first: lower.length === 0 ? null : lower.sort()[0],
    last: upper.length === 0 ? null : upper.sort().at(-1),
  };
}

/**
 * The shape `resolveWorkDate` documents: each assignment carrying its shift,
 * and each shift carrying its TEAM's midnight-crossing window as
 * `crossingWindowHours`. §8.2 — the engine never reads policy itself, so the
 * value is resolved and attached here.
 *
 * An unset window stays `undefined` rather than defaulting to a number: §8.3
 * and DC-6 require the missing configuration to surface as
 * SHIFT_CONFIGURATION_INCOMPLETE, and a default would hide it behind a guess.
 */
export async function resolveShiftAssignmentsWithShifts(
  userId,
  { user = null, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const stored = await listShiftAssignments(userId, companyId);

  /**
   * A user who has never been re-assigned has no assignment rows at all — the
   * shift on their record has applied since the day they joined. Synthesising
   * that row is the same convention `moveUserTeam` already follows when it
   * backfills a team a user held before assignments were recorded; without it
   * the engine would raise NO_SHIFT_ASSIGNED for someone who plainly has one.
   */
  const owner = user ?? (await getUserById(userId, companyId));
  const assignments =
    stored.length > 0
      ? stored
      : owner?.shiftId
        ? [
            {
              userId,
              shiftId: owner.shiftId,
              effectiveFrom: owner.dateOfJoining,
              effectiveTo: null,
            },
          ]
        : [];

  if (assignments.length === 0) return [];

  const db = await getDb();
  const shiftIds = [
    ...new Set(assignments.map((assignment) => assignment.shiftId)),
  ]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const shifts = await db
    .collection(COLLECTIONS.SHIFTS)
    .find({ companyId, _id: { $in: shiftIds } })
    .toArray();

  const shiftById = new Map(shifts.map((shift) => [String(shift._id), shift]));
  const teamIds = [...new Set(shifts.map((shift) => shift.teamId))];

  const policies = await db
    .collection(COLLECTIONS.TEAM_POLICY)
    .find({ companyId, teamId: { $in: teamIds } })
    .toArray();

  const windowByTeam = new Map(
    policies.map((policy) => [
      policy.teamId,
      policy.midnightCrossingWindowHours,
    ]),
  );

  return assignments
    .map((assignment) => {
      const shift = shiftById.get(String(assignment.shiftId));
      if (!shift) return null;

      return {
        ...assignment,
        shift: {
          ...shift,
          crossingWindowHours: windowByTeam.get(shift.teamId),
        },
      };
    })
    .filter(Boolean);
}

/**
 * Everything one user's recalculation reads, in one round trip per collection
 * rather than one per date. NFR-3 puts a full-company month under two seconds,
 * which a per-date query cannot meet.
 */
export async function loadRecalculationInputs(
  userId,
  { from, to },
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  const user = await getUserById(userId, companyId);
  if (!user) return null;

  const tenures = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId, deletedAt: null })
    .sort({ startDate: 1 })
    .toArray();

  const teamAssignments = await listTeamAssignments(userId, companyId);
  const shiftAssignments = await resolveShiftAssignmentsWithShifts(userId, {
    user,
    companyId,
  });

  const teamIds = [
    ...new Set([
      ...teamAssignments.map((assignment) => assignment.teamId),
      user.teamId,
    ]),
  ].filter(Boolean);

  const policyByTeam = {};
  const holidaysByTeam = {};
  const weeklyOffByTeam = {};

  for (const teamId of teamIds) {
    policyByTeam[teamId] = (await getTeamPolicy(teamId, companyId)) ?? {};
    holidaysByTeam[teamId] = (await listHolidays(teamId, { companyId })).items;
    weeklyOffByTeam[teamId] = await getWeeklyOffPattern(teamId, companyId);
  }

  const dayRecords = await listDayRecords({
    userIds: [userId],
    from,
    to,
    companyId,
  });

  const leaveRecords = await db
    .collection(COLLECTIONS.LEAVE_RECORDS)
    .find({
      companyId,
      userId,
      date: { $gte: from, $lte: to },
      deletedAt: null,
    })
    .toArray();

  return {
    user,
    tenures,
    teamAssignments,
    shiftAssignments,
    dayRecords,
    leaveRecords,
    policyByTeam,
    holidaysByTeam,
    weeklyOffByTeam,
  };
}

/**
 * S-09. FR-5.6 and FR-5.7: what the engine concluded, totalled over a range.
 *
 * Computed by the database rather than in this process, because NFR-3 puts a
 * full-company month under two seconds at p95 and NFR-5 sizes for 1000 users
 * over five years — pulling every record back to add it up stops meeting that
 * long before the roster does.
 *
 * Every total reads the EFFECTIVE value (`$ifNull` over the override), so an
 * administrator's decision counts exactly as the engine's own conclusion
 * would (FR-6.11). A figure totalled one way here and another way on S-10 is
 * precisely the drift NFR-8 forbids.
 *
 * FR-2.10: untracked colleagues receive no day records, so they contribute
 * nothing — but they are counted, because the screen has to state the
 * exclusion rather than leave it silent.
 */
export async function summariseAttendance({
  from,
  to,
  teamId = null,
  userId = null,
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
}) {
  const db = await getDb();

  /**
   * An id that cannot parse reaches NOBODY, rather than dropping the filter.
   *
   * `authz/rosterScope.js` narrows a viewer holding no scope to a sentinel id
   * nobody holds, and a caller may equally arrive with a hand-edited URL.
   * Ignoring the unparseable value would widen the query from one colleague to
   * every colleague — failing open is the one outcome DC-6 forbids.
   */
  if (userId && !ObjectId.isValid(userId)) {
    return { rows: [], untrackedCount: 0 };
  }

  const userFilter = { companyId, tracked: true };
  if (teamId) userFilter.teamId = teamId;
  if (userId) userFilter._id = new ObjectId(userId);
  if (!includeDeleted) userFilter.deletedAt = null;

  const users = await db
    .collection(COLLECTIONS.USERS)
    .find(userFilter)
    .sort({ fullName: 1 })
    .toArray();

  const untrackedFilter = { companyId, tracked: false };
  if (teamId) untrackedFilter.teamId = teamId;
  if (!includeDeleted) untrackedFilter.deletedAt = null;
  const untrackedCount = await db
    .collection(COLLECTIONS.USERS)
    .countDocuments(untrackedFilter);

  if (users.length === 0) return { rows: [], untrackedCount };

  const userIds = users.map((user) => String(user._id));

  /** The status a reader sees: the human decision where there is one. */
  const effectiveStatus = {
    $ifNull: ['$override.dayStatus', '$computed.dayStatus'],
  };
  const effectiveLate = {
    $ifNull: ['$override.lateMinutes', '$computed.lateMinutes'],
  };

  const countWhen = (condition) => ({
    $sum: { $cond: [condition, 1, 0] },
  });

  /**
   * "Present" means a day that was worked, wherever it was worked from, so a
   * work-from-home day counts in both `present` and `wfh`. spec.md defines
   * neither column, and the alternative — present meaning in-office only —
   * would leave a full week worked from home reading as a week of nothing.
   * `wfh` remains its own column because BR-16 caps it as a quota.
   */

  /**
   * The two hours totals, `FR-8.3`, read off the day record rather than off
   * the user.
   *
   * A record already carries the shift held on THAT date and the day type
   * resolved for it, so a colleague who moved shift mid-month is counted
   * against each shift on the dates it applied. Looking up their current shift
   * instead would get that wrong and say nothing about having done so.
   *
   * Approved leave is netted off the expectation and reported beside it, so
   * "checked in against expected" reads as a real shortfall rather than
   * punishing anyone who took the leave they are owed.
   */
  const effectiveWorkedMinutes = {
    $ifNull: [
      { $ifNull: ['$override.workedMinutes', '$computed.workedMinutes'] },
      0,
    ],
  };

  const totals = await db
    .collection(COLLECTIONS.DAY_RECORDS)
    .aggregate([
      {
        $match: {
          companyId,
          deletedAt: null,
          userId: { $in: userIds },
          date: { $gte: from, $lte: to },
        },
      },
      {
        // A shift deleted since the record was written leaves an empty array
        // rather than failing the stage, which `$ifNull` below turns into an
        // expectation of zero — a missing shift cannot be an expectation.
        $lookup: {
          from: COLLECTIONS.SHIFTS,
          let: { shiftId: '$shiftId' },
          pipeline: [
            {
              $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$shiftId'] } },
            },
            { $project: { requiredDailyMinutes: 1 } },
          ],
          as: 'shiftHeld',
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.LEAVE_RECORDS,
          let: { forUser: '$userId', onDate: '$date' },
          pipeline: [
            {
              $match: {
                companyId,
                deletedAt: null,
                $expr: {
                  $and: [
                    { $eq: ['$userId', '$$forUser'] },
                    { $eq: ['$date', '$$onDate'] },
                  ],
                },
              },
            },
            { $project: { amount: 1 } },
          ],
          as: 'leaveTaken',
        },
      },
      {
        $set: {
          requiredMinutes: {
            $cond: [
              { $eq: ['$dayType', DAY_TYPE.WORKING] },
              {
                $ifNull: [{ $first: '$shiftHeld.requiredDailyMinutes' }, 0],
              },
              0,
            ],
          },
          // A half day is 0.5, so it removes half the expectation and reports
          // half a day of leave. BR-11's full day removes all of it.
          leaveShare: { $ifNull: [{ $first: '$leaveTaken.amount' }, 0] },
        },
      },
      {
        $set: {
          approvedLeaveMinutes: {
            $multiply: ['$requiredMinutes', '$leaveShare'],
          },
        },
      },
      {
        $group: {
          _id: '$userId',
          present: countWhen({
            $in: [effectiveStatus, [DAY_STATUS.WFO, DAY_STATUS.WFH]],
          }),
          absent: countWhen({ $eq: [effectiveStatus, DAY_STATUS.ABSENT] }),
          wfh: countWhen({ $eq: [effectiveStatus, DAY_STATUS.WFH] }),
          leave: countWhen({ $eq: [effectiveStatus, DAY_STATUS.LEAVE] }),
          /**
           * FR-5.6 and BR-27: a day counts as worked on a non-working day only
           * above that team's threshold. A HOLIDAY_WORK day below it is still
           * SHOWN with its duration on S-10 and S-12 — status and counting are
           * separate questions — but it is not counted here. The engine has
           * already applied the threshold, so this reads its answer rather
           * than re-deriving one.
           */
          holidayWork: countWhen({
            $eq: ['$computed.countsAsHolidayWork', true],
          }),
          lateDays: countWhen({ $gt: [effectiveLate, 0] }),
          shortDays: countWhen({ $eq: ['$computed.isShortDay', true] }),
          checkedInMinutes: { $sum: effectiveWorkedMinutes },
          expectedMinutes: {
            $sum: { $subtract: ['$requiredMinutes', '$approvedLeaveMinutes'] },
          },
          approvedLeaveMinutes: { $sum: '$approvedLeaveMinutes' },
        },
      },
    ])
    .toArray();

  /**
   * Leave is broken down by TYPE (FR-5.7), and the type lives on the leave
   * record rather than on the day — D-9 makes the record the thing that states
   * which balance a day spends.
   */
  const leaveTotals = await db
    .collection(COLLECTIONS.LEAVE_RECORDS)
    .aggregate([
      {
        $match: {
          companyId,
          deletedAt: null,
          userId: { $in: userIds },
          date: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: { userId: '$userId', leaveType: '$leaveType' },
          days: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const totalsByUser = new Map(totals.map((row) => [row._id, row]));

  const leaveByUser = new Map();
  for (const row of leaveTotals) {
    const forUser = leaveByUser.get(row._id.userId) ?? {};
    forUser[row._id.leaveType] = row.days;
    leaveByUser.set(row._id.userId, forUser);
  }

  const rows = users.map((user) => {
    const id = String(user._id);
    const totalsForUser = totalsByUser.get(id) ?? {};

    return {
      userId: id,
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      deletedAt: user.deletedAt,
      present: totalsForUser.present ?? 0,
      absent: totalsForUser.absent ?? 0,
      wfh: totalsForUser.wfh ?? 0,
      leave: totalsForUser.leave ?? 0,
      holidayWork: totalsForUser.holidayWork ?? 0,
      lateDays: totalsForUser.lateDays ?? 0,
      shortDays: totalsForUser.shortDays ?? 0,
      checkedInMinutes: totalsForUser.checkedInMinutes ?? 0,
      expectedMinutes: totalsForUser.expectedMinutes ?? 0,
      approvedLeaveMinutes: totalsForUser.approvedLeaveMinutes ?? 0,
      leaveByType: leaveByUser.get(id) ?? {},
    };
  });

  return { rows, untrackedCount };
}

// --- The ledger ------------------------------------------------------------

export async function listLedgerEntriesForSource(
  sourceType,
  sourceId,
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .find({ companyId, sourceType, sourceId: String(sourceId) })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
}

/**
 * §19.1. Appends movements. There is deliberately no function here that
 * updates one — FR-6.8 and DC-3 make the ledger strictly append-only, and a
 * movement is cancelled only by its reverse.
 *
 * A duplicate-key failure on `effectKey` is swallowed, and ONLY that: the
 * index firing means this exact effect at this exact source version is already
 * recorded, so refusing the second insert is the correct outcome rather than
 * an error (§19.3 — defence in depth behind `reconcileLedger`). Every other
 * write failure propagates, because swallowing one would hide a real defect
 * behind a tidy response.
 */
export async function postLedgerEntries(
  entries,
  { sourceType, sourceId, sourceVersion, userId, date, actor, reason = null },
  companyId = DEFAULT_COMPANY_ID,
) {
  if (entries.length === 0) return [];

  const db = await getDb();
  const now = new Date();
  const written = [];

  for (const entry of entries) {
    const doc = {
      companyId,
      userId,
      date,
      entryType: entry.entryType,
      leaveType: entry.leaveType,
      amount: entry.amount,
      rule: entry.rule,
      sourceType,
      sourceId: String(sourceId),
      sourceVersion,
      effectKey: ledgerEffectKey({
        sourceType,
        sourceId: String(sourceId),
        sourceVersion,
        entryType: entry.entryType,
        leaveType: entry.leaveType,
      }),
      reversalOf: null,
      actorId: actor.userId,
      actorName: actor.name,
      reason,
      createdAt: now,
    };

    try {
      const { insertedId } = await db
        .collection(COLLECTIONS.LEDGER_ENTRIES)
        .insertOne(doc);
      written.push({ ...doc, _id: insertedId });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // Already recorded at this source version. Correct, not an error.
    }
  }

  return written;
}

/** A user's live tenures, oldest first — the employment period, in order. */
export async function listTenures(userId, companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId, deletedAt: null })
    .sort({ startDate: 1 })
    .toArray();
}

/**
 * The same read for a whole roster at once, grouped by user.
 *
 * A screen showing a month for every colleague needs each person's employment
 * period. Calling the single-user form in a loop is one round trip per
 * colleague per page load, which is the shape NFR-3's two-second budget rules
 * out — so the batched form exists even though the single one already does.
 */
export async function listTenuresForUsers(
  userIds,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId: { $in: userIds }, deletedAt: null })
    .sort({ userId: 1, startDate: 1 })
    .toArray();

  return groupByUser(rows);
}

/**
 * P-19, FR-6.13. At go-live an OFFICE_ADMIN enters each opening balance by
 * hand from the old workbook. The system does not compute it — historical
 * attendance is deliberately not migrated, only the roster (FR-2.9) — so the
 * reason is mandatory and the entry is labelled as what it is.
 *
 * A user created after cutover has no opening entry at all, and S-14 says so
 * rather than showing a zero row.
 */
export async function postOpeningBalance(
  { userId, leaveType, amount, date, reason },
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  parse(reasonSchema, { reason });

  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new ValidationError('An opening balance must be a number.');
  }

  const [posted] = await postLedgerEntries(
    [
      {
        entryType: LEDGER_ENTRY_TYPE.OPENING_BALANCE,
        leaveType,
        amount,
        rule: MANUAL_GRANT,
      },
    ],
    {
      sourceType: 'cutover',
      sourceId: userId,
      sourceVersion: leaveType,
      userId,
      date,
      actor,
      reason,
    },
    companyId,
  );

  if (!posted) {
    throw new ValidationError(
      `An opening balance for ${leaveType} already exists for this user. A ledger entry is corrected by reversing it, never by entering a second one.`,
    );
  }

  return posted;
}

/**
 * P-20, FR-2.7 and FR-6.10. Overrides the entitlement the engine prorated.
 *
 * The engine's own credit is REVERSED rather than edited away (FR-6.8), so
 * S-14 shows what was computed, that it was cancelled, and what an
 * administrator put in its place — which is what keeps NFR-11 answerable
 * after someone has intervened.
 */
export async function overrideEntitlement(
  { userId, leaveType, leaveYear, amount, reason },
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  parse(reasonSchema, { reason });

  const db = await getDb();

  const existing = await db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .find({
      companyId,
      userId,
      leaveType,
      entryType: LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT,
      date: leaveYear.start,
    })
    .toArray();

  const reversals = await db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .find({ companyId, userId, entryType: LEDGER_ENTRY_TYPE.REVERSAL })
    .toArray();

  const alreadyReversed = new Set(
    reversals.map((entry) => String(entry.reversalOf)),
  );

  const live = existing.filter(
    (entry) => !alreadyReversed.has(String(entry._id)),
  );

  if (live.length > 0) {
    await reverseLedgerEntries(live, { actor, reason }, companyId);
  }

  const [posted] = await postLedgerEntries(
    [
      {
        entryType: LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT,
        leaveType,
        amount,
        rule: MANUAL_GRANT,
      },
    ],
    {
      sourceType: 'entitlementOverride',
      sourceId: `${userId}:${leaveType}`,
      sourceVersion: `${leaveYear.start}:${amount}`,
      userId,
      date: leaveYear.start,
      actor,
      reason,
    },
    companyId,
  );

  return posted ?? null;
}

/**
 * §19.2 and I-2. **A balance is never stored.** It is replayed by summing
 * entries, and this is the only place that sum lives.
 *
 *   replayBalance(userId, leaveType, asOfDate):
 *     Σ amount where userId, leaveType, date <= asOfDate
 *
 * Every entry is already signed (§19.1), which is why BR-14's two formulas —
 * the leave balance and the PTO balance — are one implementation. Do not write
 * a second.
 */
export async function replayBalance(
  userId,
  leaveType,
  asOfDate,
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();

  const [result] = await db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .aggregate([
      { $match: { companyId, userId, leaveType, date: { $lte: asOfDate } } },
      { $group: { _id: null, balance: { $sum: '$amount' } } },
    ])
    .toArray();

  return result?.balance ?? 0;
}

/**
 * S-14's whole read: every movement in order, oldest first, so the screen can
 * run a balance down the column and show what each entry did to it.
 */
export async function listLedgerEntriesForUser(
  userId,
  {
    leaveType = null,
    from = null,
    to = null,
    companyId = DEFAULT_COMPANY_ID,
  } = {},
) {
  const db = await getDb();
  const filter = { companyId, userId };

  if (leaveType) filter.leaveType = leaveType;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  return db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .find(filter)
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .toArray();
}

/**
 * S-13. BR-14 in the shape the screen shows it: opening, credited, availed,
 * automatic deductions and CTO applied, per user per leave type.
 *
 * The named columns are DERIVED FROM the same entries the balance sums, so
 * they cannot disagree with it — a breakdown computed from a second source is
 * how a screen ends up showing parts that do not add to the whole.
 *
 * Availed and deductions are reported as positive magnitudes because that is
 * how they read in a column headed "availed"; the balance keeps the signs.
 */
export async function summariseBalances({
  userIds,
  from,
  to,
  companyId = DEFAULT_COMPANY_ID,
}) {
  const db = await getDb();

  const sumWhen = (types) => ({
    $sum: { $cond: [{ $in: ['$entryType', types] }, '$amount', 0] },
  });

  const rows = await db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .aggregate([
      {
        $match: {
          companyId,
          userId: { $in: userIds },
          date: { $lte: to },
        },
      },
      {
        $group: {
          _id: { userId: '$userId', leaveType: '$leaveType' },
          balance: { $sum: '$amount' },
          opening: sumWhen([LEDGER_ENTRY_TYPE.OPENING_BALANCE]),
          credited: sumWhen([LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT]),
          availed: sumWhen([LEDGER_ENTRY_TYPE.LEAVE_AVAILED]),
          deductions: sumWhen([LEDGER_ENTRY_TYPE.AUTOMATIC_DEDUCTION]),
          ctoApplied: sumWhen([LEDGER_ENTRY_TYPE.CTO_APPLIED]),
          wfhUsed: sumWhen([LEDGER_ENTRY_TYPE.WFH_USED]),
        },
      },
      { $sort: { '_id.userId': 1, '_id.leaveType': 1 } },
    ])
    .toArray();

  return {
    rows: rows.map((row) => ({
      userId: row._id.userId,
      leaveType: row._id.leaveType,
      opening: row.opening,
      credited: row.credited,
      availed: Math.abs(row.availed),
      deductions: Math.abs(row.deductions),
      ctoApplied: row.ctoApplied,
      wfhUsed: Math.abs(row.wfhUsed),
      balance: row.balance,
    })),
    // The range's start is not a filter on the sum — a balance is everything
    // up to a date, not a slice (§19.2) — but S-13 shows it, so it travels.
    from,
    to,
  };
}

/**
 * §19.4. The original is untouched; the reverse is appended. S-14 shows both,
 * with the reversal marked, which is how NFR-11 — "why is this number what it
 * is" — stays answerable.
 *
 * A reversal deliberately carries NO `effectKey`: a movement may legitimately
 * be reversed and re-applied, and the partial unique index excludes it by the
 * field's absence, since `$ne` is not permitted in a partialFilterExpression
 * (§19.3).
 */
export async function reverseLedgerEntries(
  entries,
  { actor, reason },
  companyId = DEFAULT_COMPANY_ID,
) {
  if (entries.length === 0) return [];

  parse(reasonSchema, { reason });
  const db = await getDb();
  const now = new Date();

  const docs = entries.map((entry) => ({
    companyId,
    userId: entry.userId,
    date: entry.date,
    entryType: LEDGER_ENTRY_TYPE.REVERSAL,
    leaveType: entry.leaveType,
    amount: -entry.amount,
    rule: entry.rule,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion,
    reversalOf: entry._id,
    actorId: actor.userId,
    actorName: actor.name,
    reason,
    createdAt: now,
  }));

  const { insertedIds } = await db
    .collection(COLLECTIONS.LEDGER_ENTRIES)
    .insertMany(docs);

  return docs.map((doc, index) => ({ ...doc, _id: insertedIds[index] }));
}

// --- Attendance import -----------------------------------------------------

/**
 * S-11 step 2's whole read: the users those employee codes belong to, each
 * carrying what the validator needs to judge a row — their tenures, whether
 * they are tracked, and the timezone of the shift their punches are entered
 * in.
 *
 * One bulk query rather than one per row. NFR-4 requires 40,000 rows to
 * validate and preview in under ten seconds, which a per-row lookup cannot
 * meet at any roster size worth importing.
 */
export async function loadImportContext(
  { codes },
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();

  const users = await db
    .collection(COLLECTIONS.USERS)
    .find({ companyId, employeeCode: { $in: codes } })
    .toArray();

  if (users.length === 0) return { usersByCode: new Map() };

  const userIds = users.map((user) => String(user._id));

  const tenures = await db
    .collection(COLLECTIONS.TENURES)
    .find({ companyId, userId: { $in: userIds }, deletedAt: null })
    .toArray();

  const shiftIds = [...new Set(users.map((user) => user.shiftId))]
    .filter((id) => id && ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const shifts = await db
    .collection(COLLECTIONS.SHIFTS)
    .find({ companyId, _id: { $in: shiftIds } })
    .toArray();

  const timezoneByShift = new Map(
    shifts.map((shift) => [String(shift._id), shift.timezone]),
  );

  const tenuresByUser = new Map();
  for (const tenure of tenures) {
    tenuresByUser.set(tenure.userId, [
      ...(tenuresByUser.get(tenure.userId) ?? []),
      tenure,
    ]);
  }

  const usersByCode = new Map(
    users.map((user) => [
      user.employeeCode,
      {
        ...user,
        tenures: tenuresByUser.get(String(user._id)) ?? [],
        /**
         * §7.2: a punch's wall-clock time in the sheet is read in the timezone
         * of the shift it belongs to. A user with no shift has no timezone to
         * read it in — the validator still accepts nothing for them, because
         * §8.3 will raise SHIFT_CONFIGURATION_INCOMPLETE on the day itself.
         */
        timezone: timezoneByShift.get(String(user.shiftId)) ?? 'UTC',
      },
    ]),
  );

  return { usersByCode };
}

/**
 * FR-4.5: every accepted row is written or none is.
 *
 * `insertMany` ordered, in one call, so the driver rejects the whole batch
 * rather than leaving some rows behind. That is a guarantee about the
 * observable outcome — a partially applied import must never be queryable —
 * not a promise about the number of database calls.
 *
 * The work date is deliberately left null: §13 resolves it against the shift
 * held on the day, and the caller recalculates the users and dates returned
 * here. An importer that guessed the date would put every night-shift
 * check-out on the wrong record.
 */
export async function commitAttendanceImport(
  rows,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (rows.length === 0) return { inserted: 0, userIds: [], dates: [] };

  const db = await getDb();
  const now = new Date();

  const docs = rows.map((row) => {
    const at = parseISO(row.at);

    if (!isValidDate(at)) {
      throw new ValidationError(
        `Row for ${row.employeeCode ?? row.userId} carries an unreadable time, so nothing was imported.`,
      );
    }

    return {
      companyId,
      userId: row.userId,
      at,
      type: row.type,
      source: PUNCH_SOURCE.IMPORT,
      workDate: null,
      workDateExceptionCode: null,
      isDuplicate: false,
      duplicateAcknowledgedAt: null,
      duplicateAcknowledgedBy: null,
      duplicateReason: null,
      version: 1,
      deletedAt: null,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };
  });

  await db.collection(COLLECTIONS.PUNCHES).insertMany(docs, { ordered: true });

  const userIds = [...new Set(docs.map((doc) => doc.userId))];
  const dates = [
    ...new Set(docs.map((doc) => format(doc.at, 'yyyy-MM-dd'))),
  ].sort();

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'ATTENDANCE_IMPORTED',
    entityType: 'punch',
    entityId: 'import',
    after: {
      inserted: docs.length,
      users: userIds.length,
      from: dates[0],
      to: dates.at(-1),
    },
    reason: `Imported ${docs.length} punches for ${userIds.length} colleagues`,
    companyId,
  });

  return { inserted: docs.length, userIds, dates };
}

// --- PTO awards and CTO applications -----------------------------------------

/**
 * D-21 (design record). One earned balance (PTO), two ways to spend it. Both
 * collections share a lifecycle — proposed, approved, declined — which is why
 * `engine/candidates.js`'s `reconcileCandidate` serves both.
 *
 * `date` is the date the extra work was performed (PTO) or the date of the
 * late arrival CTO is applied against (CTO) — never the date of the decision.
 *
 * ```js
 * // ptoAwards
 * {
 *   companyId, userId, date,
 *   rule: 'BR-19' | 'MANUAL_GRANT',
 *   proposedAmount, approvedAmount,   // null until approved
 *   status: 'PENDING' | 'APPROVED' | 'DECLINED',
 *   expiresAt, expiryExtended,        // set on approval — D-24
 *   declinedSnapshot,                 // { rule, amount } — D-22
 *   withdrawn,                        // the day no longer qualifies — never deleted
 *   actorId, actorName, reason,       // the decision, not the proposal
 *   version, deletedAt, createdAt, createdBy, updatedAt, updatedBy,
 * }
 * // ctoApplications: the same shape, substituting `appliedAmount` for
 * // `approvedAmount` and adding `blockOverridden` (BR-26, D-23).
 * ```
 */
async function upsertCandidate(
  collectionName,
  userId,
  date,
  { action, patch },
  actor,
  { amountField, extraDefaults, companyId },
) {
  if (action === 'NONE') return null;

  const db = await getDb();
  const now = new Date();

  if (action === 'CREATE') {
    const doc = {
      companyId,
      userId,
      date,
      rule: patch.rule,
      [amountField]: patch.amount,
      status: patch.status,
      declined: false,
      withdrawn: false,
      declinedSnapshot: null,
      actorId: null,
      actorName: null,
      reason: null,
      ...extraDefaults,
      version: 1,
      deletedAt: null,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };
    const { insertedId } = await db.collection(collectionName).insertOne(doc);
    return { ...doc, _id: insertedId };
  }

  // UPDATE — either a fresh rule/amount on a PENDING record (which also
  // reactivates one previously withdrawn, since the day now qualifies again),
  // or a withdrawal of one the day no longer implies.
  const existing = await db
    .collection(collectionName)
    .findOne({ companyId, userId, date, declined: false });
  if (!existing) return null;

  const set = patch.withdrawn
    ? { withdrawn: true, updatedAt: now }
    : {
        rule: patch.rule,
        [amountField]: patch.amount,
        withdrawn: false,
        updatedAt: now,
      };

  return db
    .collection(collectionName)
    .findOneAndUpdate(
      { _id: existing._id },
      { $set: set, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
}

export async function getPtoAwardById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection(COLLECTIONS.PTO_AWARDS)
    .findOne({ _id: new ObjectId(id), companyId });
}

export async function getCtoApplicationById(
  id,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection(COLLECTIONS.CTO_APPLICATIONS)
    .findOne({ _id: new ObjectId(id), companyId });
}

/**
 * The version-checked write every PTO/CTO status transition shares — approve,
 * decline, an expiry override. Each caller supplies its own audit `action`
 * name and the fields being set; this is only the mechanics.
 */
async function updateCandidateStatus(
  collectionName,
  id,
  patch,
  version,
  actor,
  { action, entityType, companyId },
) {
  if (!ObjectId.isValid(id)) return null;

  const before = await (collectionName === COLLECTIONS.PTO_AWARDS
    ? getPtoAwardById(id, companyId)
    : getCtoApplicationById(id, companyId));
  if (!before) return null;

  const { reason, ...fields } = patch;
  parse(reasonSchema, { reason });
  const now = new Date();

  const after = await updateWithVersion(
    collectionName,
    id,
    version,
    {
      $set: {
        ...fields,
        actorId: actor.userId,
        actorName: actor.name,
        reason,
        updatedAt: now,
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action,
    entityType,
    entityId: id,
    before,
    after,
    reason,
    companyId,
  });

  return after;
}

/** P-01, FR-7.1, FR-7.2. `engine/pto.js`'s `approvePtoAward` computes `patch`. */
export async function markPtoAwardApproved(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return updateCandidateStatus(
    COLLECTIONS.PTO_AWARDS,
    id,
    patch,
    version,
    actor,
    {
      action: 'PTO_AWARD_APPROVED',
      entityType: 'ptoAward',
      companyId,
    },
  );
}

/**
 * P-03, FR-7.8.
 *
 * `declined: true` is set here rather than left to the caller: it is what
 * releases the one-live-candidate-per-date index (partial on `declined:
 * false`), and D-22's whole lifecycle depends on a declined day being
 * proposable again. Setting only `status` would leave the row occupying the
 * slot and collide the re-proposal at the index.
 */
export async function markPtoAwardDeclined(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return updateCandidateStatus(
    COLLECTIONS.PTO_AWARDS,
    id,
    { ...patch, declined: true },
    version,
    actor,
    {
      action: 'PTO_AWARD_DECLINED',
      entityType: 'ptoAward',
      companyId,
    },
  );
}

/** P-27, FR-7.3, FR-6.10. */
export async function overridePtoAwardExpiry(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return updateCandidateStatus(
    COLLECTIONS.PTO_AWARDS,
    id,
    patch,
    version,
    actor,
    {
      action: 'PTO_EXPIRY_OVERRIDDEN',
      entityType: 'ptoAward',
      companyId,
    },
  );
}

/**
 * The PTO awards whose expiry has passed. `D-24`'s guard attempts to post
 * `PTO_EXPIRY` for every one of these on every call — exactly like
 * `ensureEntitlementCredited` (`D-12`), it keeps no bookkeeping flag of its
 * own and relies entirely on the ledger's `effectKey` index to make a
 * repeated run silently post nothing for an award already processed.
 */
export async function listApprovedPtoAwardsPastExpiry(
  userId,
  asOfDate,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.PTO_AWARDS)
    .find({
      companyId,
      userId,
      status: 'APPROVED',
      expiresAt: { $ne: null, $lte: asOfDate },
    })
    .toArray();
}

/** P-01 (CTO), §22.1, `BR-26`. `engine/cto.js`'s `approveCtoApplication` computes `patch`. */
export async function markCtoApplicationApproved(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return updateCandidateStatus(
    COLLECTIONS.CTO_APPLICATIONS,
    id,
    patch,
    version,
    actor,
    {
      action: 'CTO_APPLICATION_APPROVED',
      entityType: 'ctoApplication',
      companyId,
    },
  );
}

/** §22, `FR-7.8`'s decline lifecycle applied to CTO — `declined` as above. */
export async function markCtoApplicationDeclined(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return updateCandidateStatus(
    COLLECTIONS.CTO_APPLICATIONS,
    id,
    { ...patch, declined: true },
    version,
    actor,
    {
      action: 'CTO_APPLICATION_DECLINED',
      entityType: 'ctoApplication',
      companyId,
    },
  );
}

export async function getPtoAwardForDate(
  userId,
  date,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.PTO_AWARDS)
    .findOne({ companyId, userId, date, status: { $ne: 'DECLINED' } });
}

/**
 * §21, `D-21`, `D-22`. `reconcileCandidate`'s verdict, applied. `CREATE` and
 * `UPDATE` write; `NONE` writes nothing — the caller passes exactly what the
 * pure function returned, so this stays a thin translation into storage.
 */
export async function upsertPtoCandidate(
  userId,
  date,
  { action, patch },
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return upsertCandidate(
    COLLECTIONS.PTO_AWARDS,
    userId,
    date,
    { action, patch },
    actor,
    {
      amountField: 'proposedAmount',
      extraDefaults: {
        approvedAmount: null,
        expiresAt: null,
        expiryExtended: false,
      },
      companyId,
    },
  );
}

/**
 * `D-22` keeps a withdrawn candidate rather than deleting it, but the day
 * stopped qualifying — so it is left out by default. Listing it would put a
 * suggestion the engine has retracted back into `S-15`'s approval queue.
 */
export async function listPtoAwards({
  userIds = null,
  status = null,
  from = null,
  to = null,
  includeWithdrawn = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeWithdrawn) filter.withdrawn = false;
  if (userIds) filter.userId = { $in: userIds };
  if (status) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  return db
    .collection(COLLECTIONS.PTO_AWARDS)
    .find(filter)
    .sort({ date: -1, _id: -1 })
    .toArray();
}

export async function getCtoApplicationForDate(
  userId,
  date,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.CTO_APPLICATIONS)
    .findOne({ companyId, userId, date, status: { $ne: 'DECLINED' } });
}

export async function upsertCtoCandidate(
  userId,
  date,
  { action, patch },
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  return upsertCandidate(
    COLLECTIONS.CTO_APPLICATIONS,
    userId,
    date,
    { action, patch },
    actor,
    {
      amountField: 'proposedAmount',
      extraDefaults: { appliedAmount: null, blockOverridden: false },
      companyId,
    },
  );
}

/** Withdrawn applications are left out for the same reason as `listPtoAwards`. */
export async function listCtoApplications({
  userIds = null,
  status = null,
  from = null,
  to = null,
  includeWithdrawn = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeWithdrawn) filter.withdrawn = false;
  if (userIds) filter.userId = { $in: userIds };
  if (status) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  return db
    .collection(COLLECTIONS.CTO_APPLICATIONS)
    .find(filter)
    .sort({ date: -1, _id: -1 })
    .toArray();
}

// --- Leave records ---------------------------------------------------------

export async function getLeaveRecordById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db
    .collection(COLLECTIONS.LEAVE_RECORDS)
    .findOne({ _id: new ObjectId(id), companyId });
}

export async function getLeaveRecordsForUserDates(
  userId,
  dates,
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.LEAVE_RECORDS)
    .find({ companyId, userId, date: { $in: dates }, deletedAt: null })
    .sort({ date: 1, _id: 1 })
    .toArray();
}

/**
 * P-26, D-9, D-16. One date at a time (D-10): a range-recording convenience
 * would call this once per date and needs no change to the shape.
 */
export async function createLeaveRecord(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(leaveRecordSchema, input);
  const db = await getDb();

  const clash = await db.collection(COLLECTIONS.LEAVE_RECORDS).findOne({
    companyId,
    userId: data.userId,
    date: data.date,
    deletedAt: null,
  });

  if (clash) {
    throw new ValidationError(
      `${clash.leaveType} leave is already recorded for ${data.date}. Cancel that record before recording another.`,
    );
  }

  try {
    return await createOwnedRecord(COLLECTIONS.LEAVE_RECORDS, {
      data: {
        ...data,
        halfDayPeriod: data.halfDayPeriod ?? null,
        actorId: actor.userId,
        actorName: actor.name,
      },
      action: 'LEAVE_RECORDED',
      entityType: 'leaveRecord',
      companyId,
      actor,
    });
  } catch (error) {
    return rethrowDuplicateAs(
      error,
      `Leave is already recorded for ${data.date}. Cancel that record before recording another.`,
    );
  }
}

/**
 * Soft deleted rather than removed, and the caller recalculates the date so
 * the LEAVE_AVAILED entry it produced is REVERSED — never edited, never
 * deleted (FR-6.8, I-1).
 */
export async function cancelLeaveRecord(
  id,
  reason,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  parse(reasonSchema, { reason });

  return softDeleteOwnedRecord(COLLECTIONS.LEAVE_RECORDS, {
    id,
    reason,
    version,
    action: 'LEAVE_CANCELLED',
    entityType: 'leaveRecord',
    companyId,
    actor,
  });
}

// --- Seeding ---------------------------------------------------------------

/**
 * Idempotent upsert keyed on a natural key (NFR-15): running the seed twice
 * must not duplicate anything or double-post any entry.
 *
 * Lives here rather than in the script because CLAUDE.md keeps every query in
 * this file, including the ones only one caller uses.
 */
export async function upsertSeed(
  collectionName,
  documents,
  keyFields,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (documents.length === 0) return;

  const db = await getDb();
  const now = new Date();

  await db.collection(collectionName).bulkWrite(
    documents.map((doc) => {
      const filter = { companyId };
      for (const key of keyFields) filter[key] = doc[key];

      return {
        updateOne: {
          filter,
          update: {
            $set: { ...doc, companyId, deletedAt: doc.deletedAt ?? null },
            $setOnInsert: { createdAt: now, version: 1 },
          },
          upsert: true,
        },
      };
    }),
  );
}

/**
 * One-shot repair of documents written before teams carried ObjectId identity.
 *
 * Earlier seeds keyed holidays, weekly off patterns, policy and users on a
 * `teamKey` string, while every consumer — `listUsers`, `session.js`,
 * `recordInScope` — reads `teamId`. Nothing ever read `teamKey`, so those rows
 * were inert: TEAM-scoped permissions reached no record and the roster's team
 * filter matched nothing.
 *
 * This maps each one onto the real id rather than deleting it, so no
 * configuration is destroyed (`I-1`). It must run **before** `ensureIndexes`,
 * because the unique index on `(companyId, teamId)` cannot build while several
 * rows still share a null one.
 *
 * Idempotent: after the first run no document carries `teamKey`, and it
 * matches nothing.
 */
export async function migrateLegacyTeamKeys(
  teamIdByKey,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const collections = [
    COLLECTIONS.HOLIDAYS,
    COLLECTIONS.WEEKLY_OFF_PATTERNS,
    COLLECTIONS.TEAM_POLICY,
    COLLECTIONS.USERS,
  ];

  let migrated = 0;

  for (const name of collections) {
    for (const [teamKey, teamId] of Object.entries(teamIdByKey)) {
      const { modifiedCount } = await db
        .collection(name)
        .updateMany(
          { companyId, teamKey },
          { $set: { teamId }, $unset: { teamKey: '' } },
        );

      migrated += modifiedCount;
    }

    // A row whose key matches no current team keeps its data and loses only
    // the dead field, so nothing silently disappears.
    await db
      .collection(name)
      .updateMany(
        { companyId, teamKey: { $type: 'string' } },
        { $unset: { teamKey: '' } },
      );
  }

  return { migrated };
}

/**
 * Reads back the ids the seed just upserted, keyed on the natural key it
 * upserted them by.
 *
 * This is what makes the seed's second pass possible: teams and shifts carry
 * ordinary ObjectId identity, so every child document — users, holidays,
 * weekly off patterns, policy — has to be stamped with the real id rather than
 * a key string. `key` exists for this lookup and nothing else, and is null for
 * anything an administrator creates in the application.
 */
export async function getSeedIdsByKey(
  collectionName,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const docs = await db
    .collection(collectionName)
    .find({ companyId, key: { $type: 'string' } })
    .project({ key: 1 })
    .toArray();

  return Object.fromEntries(docs.map((doc) => [doc.key, String(doc._id)]));
}

/**
 * Seeds a user together with their first tenure, keeping the two stored
 * employment dates in step with it (FR-2.12).
 *
 * Keyed on employee code, which FR-2.6 makes unique across all users including
 * soft deleted ones.
 */
export async function upsertSeedUser(user, companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  const now = new Date();

  const tenures = [
    { startDate: user.dateOfJoining, endDate: null, deletedAt: null },
  ];
  const { dateOfJoining, dateOfLeaving } = deriveEmploymentDates(tenures);

  const result = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
    { companyId, employeeCode: user.employeeCode },
    {
      $set: {
        ...user,
        workEmail: user.workEmail ? user.workEmail.toLowerCase() : null,
        dateOfJoining,
        dateOfLeaving,
        companyId,
        deletedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, version: 1 },
      /**
       * Earlier seeds stamped users with a `teamKey` string while every
       * consumer — `listUsers`, `session.js`, `recordInScope` — reads
       * `teamId`. Removing it here is what brings an existing dev database
       * current without a migration script.
       */
      $unset: { teamKey: '' },
    },
    { upsert: true, returnDocument: 'after' },
  );

  await db.collection(COLLECTIONS.TENURES).updateOne(
    { companyId, userId: String(result._id), startDate: user.dateOfJoining },
    {
      $set: { endDate: null, deletedAt: null },
      $setOnInsert: { createdAt: now, version: 1 },
    },
    { upsert: true },
  );

  return result;
}

/**
 * Every collection whose documents belong to one user and mean nothing without
 * them. `auditRecords` is deliberately absent — see `purgeSeedUsers`.
 */
const USER_OWNED_COLLECTIONS = Object.freeze([
  COLLECTIONS.TENURES,
  COLLECTIONS.TEAM_ASSIGNMENTS,
  COLLECTIONS.SHIFT_ASSIGNMENTS,
  COLLECTIONS.PUNCHES,
  COLLECTIONS.DAY_RECORDS,
  COLLECTIONS.LEAVE_RECORDS,
  COLLECTIONS.PTO_AWARDS,
  COLLECTIONS.CTO_APPLICATIONS,
  COLLECTIONS.LEDGER_ENTRIES,
  COLLECTIONS.APPROVALS,
]);

/**
 * Removes seeded users outright, by employee code.
 *
 * This is the one function in the file that hard-deletes a person, and it is
 * seed maintenance rather than an application capability: `FR-2.2` and MVP
 * criterion 14 say a *user* is only ever soft deleted, and that still holds —
 * no route, page or component imports this, and `softDeleteUser` remains the
 * only way a person leaves the roster in the product.
 *
 * It exists because seeding only upserts. A demo row invented to exercise a
 * screen has no other way out of the database, and soft deleting one leaves it
 * on S-06 forever wearing a departure date it never had.
 *
 * Named codes only, and an unknown one is refused before anything is deleted:
 * a destructive one-off must fail loudly on a typo rather than half-succeed.
 * Deriving the list by subtracting the current seed would delete every real
 * person imported through S-08, which is why it is never done that way.
 *
 * `ledgerEntries` go with them, which no application path may ever do
 * (`FR-6.8`, `DC-3`: a ledger entry is cancelled by a reversing entry, never
 * removed). Reversing entries for a person who no longer exists would leave
 * the ledger describing a balance nobody holds.
 *
 * `auditRecords` stay. `FR-9.3` is append only without exception, so the
 * record of what was done to these rows outlives them.
 */
export async function purgeSeedUsers(
  employeeCodes,
  companyId = DEFAULT_COMPANY_ID,
) {
  const codes = [
    ...new Set((employeeCodes ?? []).map((code) => String(code).trim())),
  ].filter(Boolean);

  if (codes.length === 0) {
    throw new ValidationError('At least one employee code is required');
  }

  const db = await getDb();

  const users = await db
    .collection(COLLECTIONS.USERS)
    .find({ companyId, employeeCode: { $in: codes } })
    .project({ employeeCode: 1 })
    .toArray();

  const found = new Set(users.map((user) => user.employeeCode));
  const missing = codes.filter((code) => !found.has(code));

  if (missing.length > 0) {
    throw new ValidationError(
      `No user holds employee code ${missing.join(', ')}`,
    );
  }

  const userIds = users.map((user) => String(user._id));
  let removedRecords = 0;

  for (const name of USER_OWNED_COLLECTIONS) {
    const { deletedCount } = await db
      .collection(name)
      .deleteMany({ companyId, userId: { $in: userIds } });

    removedRecords += deletedCount;
  }

  /**
   * An import exception is keyed on the employee code from the spreadsheet
   * rather than on a user id, so it is matched the same way. Leaving one
   * behind queues an S-05 row against a person the system no longer knows.
   */
  const { deletedCount: removedExceptions } = await db
    .collection(COLLECTIONS.IMPORT_EXCEPTIONS)
    .deleteMany({ companyId, employeeCode: { $in: codes } });

  /**
   * FR-3.1 wants exactly one manager per team, and a dangling id is worse than
   * none: S-17 flags an unset manager, and silently resolves a missing one to
   * nothing at all.
   */
  const { modifiedCount: teamsCleared } = await db
    .collection(COLLECTIONS.TEAMS)
    .updateMany(
      { companyId, managerId: { $in: userIds } },
      { $set: { managerId: null, updatedAt: new Date() } },
    );

  const { deletedCount: removedUsers } = await db
    .collection(COLLECTIONS.USERS)
    .deleteMany({ companyId, _id: { $in: users.map((user) => user._id) } });

  return {
    removedUsers,
    removedRecords: removedRecords + removedExceptions,
    teamsCleared,
  };
}

// --- Audit reads -----------------------------------------------------------

/**
 * S-22. Every change ever made, paged and filterable.
 *
 * Read only without exception (`FR-9.3`): there is no update or delete
 * function for this collection anywhere in this file, and none may be added.
 * That is what makes the guarantee real rather than a convention — the screen
 * offers no edit because no code path exists for one.
 *
 * Paged rather than materialised (`NFR-3`, `DC-10`): the log grows without
 * limit and is never truncated. `_id` breaks the tie on `at`, because two
 * records written in the same millisecond would otherwise be free to repeat on
 * one page and vanish from the next.
 */
export async function listAuditRecords({
  actorId = null,
  actorName = null,
  action = null,
  entityType = null,
  entityId = null,
  from = null,
  to = null,
  page = 1,
  pageSize = 50,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();

  const filter = { companyId };
  if (actorId) filter.actorId = actorId;
  if (action) filter.action = action;

  // A reader looking for "who did this" knows a name, not an id. The pattern is
  // escaped, because an actor name is user-supplied and a stray `(` would
  // otherwise throw rather than match nothing.
  if (actorName?.trim()) {
    filter.actorName = new RegExp(
      actorName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
  }
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = String(entityId);

  // The filter is a pair of calendar dates; the field is an instant. `to` is
  // inclusive of its whole day, which is what a reader picking one date means.
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.at.$lte = new Date(`${to}T23:59:59.999Z`);
  }

  const collection = db.collection(COLLECTIONS.AUDIT_RECORDS);
  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize };
}

/**
 * The values `S-22`'s filters offer, taken from what is actually in the log.
 *
 * Derived rather than listed, because every phase adds its own actions and a
 * hardcoded list would silently fall behind the mutations that write them.
 */
export async function listAuditActions(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.AUDIT_RECORDS);

  const [actions, entityTypes] = await Promise.all([
    collection.distinct('action', { companyId }),
    collection.distinct('entityType', { companyId }),
  ]);

  return { actions: actions.sort(), entityTypes: entityTypes.sort() };
}

/** FR-9.4: the full change history of a single record, for P-45. */
export async function getRecordHistory(
  entityType,
  entityId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.AUDIT_RECORDS)
    .find({ companyId, entityType, entityId: String(entityId) })
    .sort({ at: -1 })
    .toArray();
}

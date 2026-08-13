import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  APPROVAL_STATUS,
  HOLIDAY_TYPE,
  RESTORE_CASE,
  ROLES,
  SCOPES,
} from './constants/index.js';
import { deriveEmploymentDates } from './utils/employment.js';
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
 * There is deliberately no function here that hard-deletes a user, an
 * attendance record, or a leave record. No endpoint can, because no code path
 * exists (FR-2.2, MVP criterion 14).
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

// --- Approvals -------------------------------------------------------------

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

// --- Audit reads -----------------------------------------------------------

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

import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';
import { APPROVAL_STATUS, RESTORE_CASE, ROLES } from './constants/index.js';
import { deriveEmploymentDates } from './utils/employment.js';

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

const parse = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return result.data;
};

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

# Phase 5 Branch 2a · Attendance Data, Ledger and Recalculation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Branch 1 engine core something real to run on — punches,
day records, leave records and ledger entries in the database; a working
`recalculateDays`; and the API contracts `S-10`/`S-12` will consume — so that
by the end of this plan a punch written through the API produces a correct,
idempotent day record and ledger movement with no screen involved.

**Architecture:** Three layers, strictly separated the way `ARCHITECTURE.md`
§1 requires. `database.js` gains every query and every write (`CLAUDE.md`: no
query lives anywhere else). `engine/ledger.js` is **pure** — it decides which
entries a day *implies* and diffs them against what exists, and writes
nothing. `engine/recalculate.js` orchestrates: it loads inputs through
`database.js`, calls Branch 1's pure functions and `engine/ledger.js`, then
persists. API routes are thin: guard, parse, delegate, respond.

**Tech Stack:** Next.js 16 route handlers, MongoDB (via `database.js`), Zod
schemas, `date-fns`/`date-fns-tz`, Vitest — `database.js` tested against a
real in-memory MongoDB via `test/mongo.js`, routes tested as contracts with a
mocked session.

**Spec:** `docs/superpowers/specs/2026-08-13-phase-5-design.md` (decisions
`D-9`–`D-15`), `ARCHITECTURE.md` §12, §19, §23, §25, `spec.md` `FR-4.x`,
`FR-5.x`, `FR-6.3`, `FR-6.8`, `FR-6.11`, `FR-6.12`, `BR-9`, `BR-11`, `BR-14`,
`BR-16`.

## Global Constraints

- **The engine core is done and is not re-opened.** `engine/workDate.js`,
  `duration.js`, `classify.js`, `punctuality.js` and `ladders.js` are imported
  as-is. If one of them looks wrong, stop and report rather than editing it —
  Branch 1 is merged and its behaviour is tested.
- **No DB query outside `database.js`** (`CLAUDE.md`). `engine/` and
  `app/api/` import from it; neither builds a filter of its own.
- **No domain literal outside `constants/index.js`** — statuses, entry types,
  exception codes, punch types, half-day periods.
- **No `new Date()` for parsing or arithmetic**; `date-fns`/`date-fns-tz` only.
  `new Date()` for "now" at a write boundary is fine and is what the existing
  code does — but never inside a calculation (`ARCHITECTURE.md` §23.5).
- **Contract tests come first** for every route (`CLAUDE.md`,
  `ARCHITECTURE.md` §9.3): request shape, response shape, status codes,
  asserted from the handler side.
- **`database.js` is tested against real MongoDB**, never a mocked driver
  (`CLAUDE.md`, `D-6`).
- **Idempotency is a test, not an aspiration** (`I-9`, `NFR-15`): running
  `recalculateDays` twice over the same range posts zero new ledger entries
  and bumps zero versions.
- **An override is never destroyed by a recalculation** (`I-6`, `FR-6.12`) —
  its own explicit test.
- Commit after every task. `npm run lint` must exit 0 before each commit; run
  `npm run lint:fix` first. Note that piping lint through `head`/`tail` masks
  its exit code — check the exit code itself.

## Decisions this plan locks in

Numbered on from the Phase 5 design record's `D-15`.

### D-16 · `leaveRecords` is built in Branch 2, not Branch 4

Ahmar's decision, 2026-08-16, amending the design record's branch table.
`P-23` (set day status) offers `LEAVE`, and per `D-9` a leave fact is a
genuine engine input rather than an override. Shipping `S-10`/`S-12` with a
status whose ledger effect arrives two branches later would put a day reading
`LEAVE` beside a balance that disagrees — exactly the drift `I-2` and `DC-4`
exist to prevent.

So the `leaveRecords` collection, its single-date write path and its
`LEAVE_AVAILED` posting land here. **Branch 4 keeps** balance replay, accrual,
entitlement crediting (`D-12`), `S-13`, `S-14`, `P-19`, `P-20` and the full
`engine/ledger.js` replay surface.

### D-17 · Reconciliation matches on effect, not on source version

`ARCHITECTURE.md` §19.3 puts `sourceVersion` in the `effectKey` so a genuine
correction is not refused by the unique index. It does **not** follow that
reconciliation should treat a version bump as a changed effect. If it did,
any change to a day record — a `lateMinutes` correction that leaves the
deduction untouched — would reverse and re-post an identical movement, and
`S-14` would fill with pairs that cancel to nothing (`NFR-11`: the ledger has
to stay readable as an explanation).

**Decision:** `reconcileLedger` matches a desired entry to an existing one on
`(entryType, leaveType, amount)`. An existing entry is reversed only when the
day no longer implies it, or implies it at a different amount. A re-posted
entry carries the current version in its `effectKey`, so the unique index
still permits the legitimate re-post and still refuses a true double-post.

### D-18 · `recalculateDays` materialises lazily by default

`D-15` says a day record is created the first time something touches the
date. A range recalculation is not, by itself, such a touch — a policy edit
covering a year must not mint 365 `ABSENT` records per user.

**Decision:** `recalculateDays(userId, dateRange, options)` refreshes only
dates that **already have a day record**, or that have a live punch or leave
record on them. `options.materialiseUsers` — a list of user ids — opts a
bounded set of users into "create the record even if the date is untouched",
which is what `S-10` passes when an `OFFICE_ADMIN` opens one team on one date
(`D-15`'s one bounded call).

---

## File structure

| File | Responsibility |
| ---- | -------------- |
| `utils/dayRecord.js` | `effective(dayRecord, field)` — the one override-resolution helper §12.1 demands, so screens, reports and the ledger cannot disagree. |
| `database.js` (additions) | Punch, day-record, leave-record and ledger schemas, queries and writes. One recalculation-input loader so the engine makes one round trip, not twelve. |
| `engine/ledger.js` | Pure. `desiredEntriesForDay` (what a day implies) and `reconcileLedger` (diff against what exists). No import of `database.js`. |
| `engine/recalculate.js` | The orchestrator. Replaces the Phase-4 no-op body. The only code that writes a day record. |
| `app/api/punches/*` | `P-21`, `P-22` — punch create, edit, soft delete. |
| `app/api/attendance/*` | `S-10`/`S-12` reads and `P-23`–`P-25` overrides. |
| `app/api/leave-records/*` | `P-26`'s single-date write path (`D-9`, `D-16`). |
| `authz/routes.js` | The endpoint half of `FR-1.2` for all of the above. |

---

### Task 1: `utils/dayRecord.js` — the effective-value helper

**Files:**
- Create: `utils/dayRecord.js`
- Test: `utils/__tests__/dayRecord.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `effective(dayRecord, field)` → the override's value for that field
  when one is set, else the computed value. `hasOverride(dayRecord, field)` →
  `boolean`, so a screen can mark the field without comparing values.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { effective, hasOverride } from '../dayRecord.js';

const record = {
  computed: { dayStatus: 'WFO', workedMinutes: 402, deduction: 0.25 },
  override: { dayStatus: 'WFH', actorId: 'a1', reason: 'Outage' },
};

describe('effective', () => {
  it('prefers the override where one is set', () => {
    expect(effective(record, 'dayStatus')).toBe('WFH');
  });

  it('falls back to the computed value for a field the override does not mention', () => {
    expect(effective(record, 'workedMinutes')).toBe(402);
  });

  it('reads computed when there is no override at all', () => {
    expect(effective({ computed: { deduction: 0.5 }, override: null }, 'deduction')).toBe(0.5);
  });

  it('treats an override of 0 as a real value, not as absent', () => {
    const waived = { computed: { deduction: 0.25 }, override: { deduction: 0 } };
    expect(effective(waived, 'deduction')).toBe(0);
  });

  it('reports which fields carry an override', () => {
    expect(hasOverride(record, 'dayStatus')).toBe(true);
    expect(hasOverride(record, 'workedMinutes')).toBe(false);
    expect(hasOverride({ computed: {}, override: null }, 'dayStatus')).toBe(false);
  });
});
```

The zero case is the reason this is a function rather than `??` typed inline:
`P-25` waives a deduction by overriding it to `0`, and `||` would silently
fall through to the engine's 0.25.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run utils/__tests__/dayRecord.test.js`
Expected: FAIL — `utils/dayRecord.js` does not exist.

- [ ] **Step 3: Implement**

```js
/**
 * ARCHITECTURE.md §12.1, FR-6.11. The effective value of any day-record field
 * is `override[field] ?? computed[field]`, written once so reports, screens
 * and the ledger cannot disagree about what a day says.
 *
 * `??` and not `||`: P-25 waives a deduction by overriding it to 0, and a
 * falsy check would discard that decision and re-apply the engine's figure —
 * an override silently undone, which is exactly what I-6 forbids.
 */
export function effective(dayRecord, field) {
  return dayRecord.override?.[field] ?? dayRecord.computed?.[field];
}

/** Whether `field` carries a human decision, for the marker S-10 and S-12 show. */
export function hasOverride(dayRecord, field) {
  return (
    dayRecord.override !== null &&
    dayRecord.override !== undefined &&
    dayRecord.override[field] !== undefined
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run utils/__tests__/dayRecord.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add utils/dayRecord.js utils/__tests__/dayRecord.test.js
git commit -m "feat: one helper for a day record's effective value (ARCHITECTURE 12.1)"
```

---

### Task 2: `database.js` — punch schema and CRUD

**Files:**
- Modify: `database.js` (add a `// --- Punches ---` section after the audit
  section's helpers, near the other collection sections)
- Modify: `constants/index.js` — nothing new; `PUNCH_TYPE` and `PUNCH_SOURCE`
  already exist
- Test: `__tests__/database.punches.test.js`

**Interfaces:**
- Consumes: `PUNCH_TYPE`, `PUNCH_SOURCE`, `EXCEPTION_CODE` from constants.
- Produces:
  - `punchSchema` — `{ userId, at (coerced Date), type, source }`.
  - `listPunchesForUserDates(userId, dates, { includeDeleted })` →
    `Punch[]` for the given `'YYYY-MM-DD'` work dates, sorted by `at`.
  - `listPunchesForWorkDate(workDate, { teamId })` → `Punch[]` across users,
    for `S-10`.
  - `getPunchById(id)` → `Punch | null`.
  - `createPunch(input, actor)` → the inserted punch, `workDate` and
    `isDuplicate` left `null`/`false` for `recalculateDays` to resolve.
  - `updatePunch(id, patch, version, actor)` → the updated punch.
  - `softDeletePunch(id, reason, version, actor)` → the updated punch.
  - `setPunchDerivedFields(punchId, { workDate, workDateExceptionCode, isDuplicate })`
    → used only by `recalculateDays`; writes no audit record and bumps no
    version, because it stores a derived conclusion rather than a human change.

The punch document:

```js
{
  companyId, userId,
  at: Date,                        // the instant, UTC — §7.2
  type: 'CHECK_IN' | 'CHECK_OUT',
  source: 'FORM' | 'IMPORT',
  workDate: '2026-08-12' | null,   // §13, resolved by the engine, not the writer
  workDateExceptionCode: null | 'NO_SHIFT_ASSIGNED' | …,
  isDuplicate: false,              // FR-4.7 — flagged, never deleted (I-1)
  version, deletedAt, createdAt, createdBy, updatedAt, updatedBy,
}
```

- [ ] **Step 1: Write the failing tests**

Create `__tests__/database.punches.test.js`, following
`__tests__/database.teams.test.js`'s shape (`useTestDatabase()` from
`test/mongo.js`, a real Mongo instance):

```js
import { describe, expect, it } from 'vitest';
import { PUNCH_SOURCE, PUNCH_TYPE } from '../constants/index.js';
import {
  createPunch,
  createUser,
  getPunchById,
  listPunchesForUserDates,
  setPunchDerivedFields,
  softDeletePunch,
  updatePunch,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

useTestDatabase();

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const aUser = async () =>
  createUser(
    {
      fullName: 'Night Owl',
      employeeCode: 'E-900',
      employmentType: 'PERMANENT',
      tracked: true,
      loginEnabled: true,
      role: 'EMPLOYEE',
      dateOfJoining: '2025-01-01',
    },
    actor,
  );

describe('createPunch', () => {
  it('stores the instant, type and source, leaving the work date for the engine', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );

    expect(punch.at).toBeInstanceOf(Date);
    expect(punch.at.toISOString()).toBe('2026-08-12T04:02:00.000Z');
    expect(punch.type).toBe(PUNCH_TYPE.CHECK_IN);
    expect(punch.workDate).toBeNull();
    expect(punch.isDuplicate).toBe(false);
    expect(punch.version).toBe(1);
    expect(punch.deletedAt).toBeNull();
  });

  it('rejects a punch type that is not one of the two', async () => {
    const user = await aUser();
    await expect(
      createPunch(
        {
          userId: String(user._id),
          at: '2026-08-12T04:02:00.000Z',
          type: 'CLOCK_IN',
          source: PUNCH_SOURCE.FORM,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an instant that is not a real time', async () => {
    const user = await aUser();
    await expect(
      createPunch(
        {
          userId: String(user._id),
          at: 'not-a-time',
          type: PUNCH_TYPE.CHECK_IN,
          source: PUNCH_SOURCE.FORM,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('writes an audit record naming the punch', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );
    const { getRecordHistory } = await import('../database.js');
    const history = await getRecordHistory('punch', String(punch._id));
    expect(history.map((entry) => entry.action)).toContain('PUNCH_CREATED');
  });
});

describe('updatePunch', () => {
  it('edits the instant in place rather than adding a cancelling punch (FR-4.12)', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );

    const updated = await updatePunch(
      String(punch._id),
      { at: '2026-08-12T05:02:00.000Z', reason: 'Imported an hour out' },
      punch.version,
      actor,
    );

    expect(updated.at.toISOString()).toBe('2026-08-12T05:02:00.000Z');
    expect(updated.version).toBe(2);

    const all = await listPunchesForUserDates(String(user._id), ['2026-08-12'], {
      includeDeleted: true,
    });
    expect(all).toHaveLength(0); // no work date resolved yet — the engine does that
  });

  it('refuses a stale write with the current state attached', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );

    await expect(
      updatePunch(String(punch._id), { at: '2026-08-12T06:00:00.000Z' }, 99, actor),
    ).rejects.toMatchObject({ name: 'StaleWriteError' });
  });

  it('returns null for an id that does not exist', async () => {
    expect(
      await updatePunch('64b7f9c2f1a2b3c4d5e6f7a8', { at: '2026-08-12T04:00:00.000Z' }, 1, actor),
    ).toBeNull();
  });
});

describe('softDeletePunch', () => {
  it('marks it deleted and keeps the row (I-1)', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );

    const deleted = await softDeletePunch(
      String(punch._id),
      'Punched for the wrong person',
      punch.version,
      actor,
    );

    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(await getPunchById(String(punch._id))).not.toBeNull();
  });
});

describe('setPunchDerivedFields', () => {
  it('stores the resolved work date without bumping the version or auditing', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );

    await setPunchDerivedFields(String(punch._id), {
      workDate: '2026-08-12',
      workDateExceptionCode: null,
      isDuplicate: false,
    });

    const after = await getPunchById(String(punch._id));
    expect(after.workDate).toBe('2026-08-12');
    expect(after.version).toBe(punch.version); // derived, not a human change
  });

  it('finds the punch by its resolved work date afterwards', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );
    await setPunchDerivedFields(String(punch._id), {
      workDate: '2026-08-12',
      workDateExceptionCode: null,
      isDuplicate: false,
    });

    const found = await listPunchesForUserDates(String(user._id), ['2026-08-12']);
    expect(found.map((row) => String(row._id))).toEqual([String(punch._id)]);
  });

  it('excludes soft-deleted punches unless asked for them', async () => {
    const user = await aUser();
    const punch = await createPunch(
      {
        userId: String(user._id),
        at: '2026-08-12T04:02:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      },
      actor,
    );
    await setPunchDerivedFields(String(punch._id), {
      workDate: '2026-08-12',
      workDateExceptionCode: null,
      isDuplicate: false,
    });
    await softDeletePunch(String(punch._id), 'Wrong person', punch.version, actor);

    expect(await listPunchesForUserDates(String(user._id), ['2026-08-12'])).toHaveLength(0);
    expect(
      await listPunchesForUserDates(String(user._id), ['2026-08-12'], {
        includeDeleted: true,
      }),
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.punches.test.js`
Expected: FAIL — the punch functions are not exported.

- [ ] **Step 3: Add the schema**

In `database.js`, beside the other schemas (after `permissionGrantSchema`):

```js
/**
 * FR-4.1. A punch is one instant and one direction — the fact. Everything
 * else about it (its work date, whether it is a duplicate) is a conclusion
 * the engine reaches later and rewrites freely, so none of it is accepted
 * from the writer.
 */
export const punchSchema = z.object({
  userId: z.string().min(1),
  at: z.coerce.date(),
  type: z.enum(Object.values(PUNCH_TYPE)),
  source: z.enum(Object.values(PUNCH_SOURCE)),
});

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
```

Import `PUNCH_SOURCE` and `PUNCH_TYPE` into `database.js`'s existing constants
import.

- [ ] **Step 4: Implement the functions**

Add a `// --- Punches ---` section:

```js
export async function getPunchById(id, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db.collection(COLLECTIONS.PUNCHES).findOne({ _id: new ObjectId(id), companyId });
}

/**
 * §13: a punch is found by its RESOLVED work date, not by the calendar date
 * of its instant — a night-shift check-out at 02:30 belongs to the previous
 * day's record. A punch whose work date has not been resolved yet matches
 * nothing here, which is correct: it has no day to belong to until the engine
 * gives it one.
 */
export async function listPunchesForUserDates(
  userId,
  dates,
  { includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  const filter = { companyId, userId, workDate: { $in: dates } };
  if (!includeDeleted) filter.deletedAt = null;

  return db.collection(COLLECTIONS.PUNCHES).find(filter).sort({ at: 1, _id: 1 }).toArray();
}

/** S-10: one date, every user on one team. */
export async function listPunchesForWorkDate(
  workDate,
  { userIds, includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const db = await getDb();
  const filter = { companyId, workDate };
  if (userIds) filter.userId = { $in: userIds };
  if (!includeDeleted) filter.deletedAt = null;

  return db.collection(COLLECTIONS.PUNCHES).find(filter).sort({ at: 1, _id: 1 }).toArray();
}

/**
 * Every punch whose INSTANT falls in a window, whatever work date it carries.
 * `recalculateDays` needs this to re-resolve work dates after a shift change:
 * the punch it must revisit is by definition one whose stored work date is
 * now wrong, so filtering by that field would hide exactly the rows it is
 * looking for (§23.3 step 3).
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

export async function createPunch(input, actor, companyId = DEFAULT_COMPANY_ID) {
  const data = parse(punchSchema, input);

  return createOwnedRecord(COLLECTIONS.PUNCHES, {
    data: {
      ...data,
      workDate: null,
      workDateExceptionCode: null,
      isDuplicate: false,
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
export async function updatePunch(id, patch, version, actor, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;

  const before = await getPunchById(id, companyId);
  if (!before) return null;

  const data = parse(punchPatchSchema, patch);
  const now = new Date();
  const { reason, ...changes } = data;

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

export async function softDeletePunch(id, reason, version, actor, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;

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
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run __tests__/database.punches.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add database.js __tests__/database.punches.test.js
git commit -m "feat: punch storage, edited in place and never cancelled by a second punch (FR-4.12)"
```

---

### Task 3: `database.js` — leave records (`D-9`, `D-16`)

**Files:**
- Modify: `database.js`
- Modify: `database.js`'s `ensureIndexes()` — add the leave-record uniqueness index
- Test: `__tests__/database.leaveRecords.test.js`

**Interfaces:**
- Consumes: `HALF_DAY_PERIOD` from constants.
- Produces:
  - `leaveRecordSchema`.
  - `getLeaveRecordsForUserDates(userId, dates)` → `LeaveRecord[]`.
  - `createLeaveRecord(input, actor)` → the record; rejects a second live
    record for the same user and date by name.
  - `cancelLeaveRecord(id, reason, version, actor)` → soft-deleted record.

The document, exactly as `D-9` specifies:

```js
{
  companyId, userId,
  date: '2026-08-12',
  leaveType: 'Casual',
  amount: 1 | 0.5,
  halfDayPeriod: 'MORNING' | 'AFTERNOON' | null,   // set iff amount is 0.5
  reason, actorId, actorName,
  version, deletedAt, createdAt, createdBy, updatedAt, updatedBy,
}
```

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { HALF_DAY_PERIOD } from '../constants/index.js';
import {
  cancelLeaveRecord,
  createLeaveRecord,
  createUser,
  getLeaveRecordsForUserDates,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

useTestDatabase();

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const aUser = async () =>
  createUser(
    {
      fullName: 'Leave Taker',
      employeeCode: 'E-901',
      employmentType: 'PERMANENT',
      tracked: true,
      loginEnabled: true,
      role: 'EMPLOYEE',
      dateOfJoining: '2025-01-01',
    },
    actor,
  );

describe('createLeaveRecord', () => {
  it('stores a full day of typed leave', async () => {
    const user = await aUser();
    const record = await createLeaveRecord(
      {
        userId: String(user._id),
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Family matter',
      },
      actor,
    );

    expect(record.amount).toBe(1);
    expect(record.halfDayPeriod).toBeNull();
    expect(record.leaveType).toBe('Casual');
  });

  it('requires a period on a half day, so the engine knows which half was worked (D-11)', async () => {
    const user = await aUser();
    await expect(
      createLeaveRecord(
        {
          userId: String(user._id),
          date: '2026-08-12',
          leaveType: 'Casual',
          amount: 0.5,
          reason: 'Dentist',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a period on a full day, which would be meaningless', async () => {
    const user = await aUser();
    await expect(
      createLeaveRecord(
        {
          userId: String(user._id),
          date: '2026-08-12',
          leaveType: 'Casual',
          amount: 1,
          halfDayPeriod: HALF_DAY_PERIOD.MORNING,
          reason: 'Family matter',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an amount that is neither a full nor a half day', async () => {
    const user = await aUser();
    await expect(
      createLeaveRecord(
        {
          userId: String(user._id),
          date: '2026-08-12',
          leaveType: 'Casual',
          amount: 0.75,
          reason: 'Partly out',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a second live leave record for the same user and date, naming the clash', async () => {
    const user = await aUser();
    await createLeaveRecord(
      {
        userId: String(user._id),
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'First',
      },
      actor,
    );

    await expect(
      createLeaveRecord(
        {
          userId: String(user._id),
          date: '2026-08-12',
          leaveType: 'Sick',
          amount: 1,
          reason: 'Second',
        },
        actor,
      ),
    ).rejects.toThrow(/already/i);
  });

  it('allows a new record on a date whose earlier one was cancelled', async () => {
    const user = await aUser();
    const first = await createLeaveRecord(
      {
        userId: String(user._id),
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'First',
      },
      actor,
    );
    await cancelLeaveRecord(String(first._id), 'Cancelled by request', first.version, actor);

    const second = await createLeaveRecord(
      {
        userId: String(user._id),
        date: '2026-08-12',
        leaveType: 'Sick',
        amount: 1,
        reason: 'Actually sick',
      },
      actor,
    );
    expect(second.leaveType).toBe('Sick');
  });
});

describe('getLeaveRecordsForUserDates', () => {
  it('returns only live records for the dates asked about', async () => {
    const user = await aUser();
    await createLeaveRecord(
      {
        userId: String(user._id),
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Out',
      },
      actor,
    );

    expect(await getLeaveRecordsForUserDates(String(user._id), ['2026-08-12'])).toHaveLength(1);
    expect(await getLeaveRecordsForUserDates(String(user._id), ['2026-08-13'])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.leaveRecords.test.js`
Expected: FAIL — the functions are not exported.

- [ ] **Step 3: Add the schema and the index**

```js
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
```

In `ensureIndexes()`, beside the day-record indexes:

```js
  await db.collection(COLLECTIONS.LEAVE_RECORDS).createIndexes([
    { key: { companyId: 1, userId: 1, date: 1 } },
    /**
     * D-9: two conflicting leave facts for one date is not a real state, the
     * same reasoning createHoliday already applies to one team observing two
     * holidays on one date. Partial on `deletedAt: null` so a cancelled
     * record does not block a corrected one.
     */
    {
      key: { companyId: 1, userId: 1, date: 1, deletedAt: 1 },
      unique: true,
      partialFilterExpression: { deletedAt: null },
      name: 'leave_record_one_per_date',
    },
  ]);
```

- [ ] **Step 4: Implement the functions**

```js
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

export async function createLeaveRecord(input, actor, companyId = DEFAULT_COMPANY_ID) {
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
 * FR-6.8 in spirit: the record is soft deleted rather than removed, and the
 * caller recalculates the date so the LEAVE_AVAILED entry it produced is
 * REVERSED — never edited, never deleted.
 */
export async function cancelLeaveRecord(id, reason, version, actor, companyId = DEFAULT_COMPANY_ID) {
  if (!ObjectId.isValid(id)) return null;

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
```

Import `HALF_DAY_PERIOD` into `database.js`'s constants import.

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run __tests__/database.leaveRecords.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add database.js __tests__/database.leaveRecords.test.js
git commit -m "feat: leave records as an engine input, one per user per date (D-9, D-16)"
```

---

### Task 4: `database.js` — day records and the override write

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.dayRecords.test.js`

**Interfaces:**
- Consumes: `DAY_STATUS`, `DAY_TYPE`.
- Produces:
  - `dayOverrideSchema` — the `P-23`/`P-24`/`P-25` payload.
  - `getDayRecord(userId, date)` → `DayRecord | null`.
  - `listDayRecords({ userIds, from, to })` → `DayRecord[]`.
  - `upsertDayRecord({ userId, date, teamId, shiftId, dayType, computed, exceptions })`
    → `{ record, changed }`. **Writes nothing and bumps no version when the
    computed block, day type, team, shift and exceptions all match what is
    stored** (§19.3's requirement on the caller).
  - `setDayOverride(userId, date, override, version, actor)` → the record.
  - `clearDayOverride(userId, date, reason, version, actor)` → the record.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import {
  getDayRecord,
  listDayRecords,
  setDayOverride,
  clearDayOverride,
  upsertDayRecord,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

useTestDatabase();

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const computed = {
  dayStatus: 'WFO',
  workedMinutes: 402,
  lateMinutes: 120,
  earlyMinutes: 0,
  deduction: 0.25,
  deductionRule: 'BR-9:profileB:band1',
  isShortDay: true,
};

const aDay = (overrides = {}) => ({
  userId: 'user-1',
  date: '2026-08-12',
  teamId: 'team-1',
  shiftId: 'shift-1',
  dayType: 'WORKING',
  computed,
  exceptions: [],
  ...overrides,
});

describe('upsertDayRecord', () => {
  it('creates the record on first write and reports it changed', async () => {
    const { record, changed } = await upsertDayRecord(aDay());
    expect(changed).toBe(true);
    expect(record.version).toBe(1);
    expect(record.computed.deduction).toBe(0.25);
  });

  it('writes NOTHING and bumps no version when nothing changed (§19.3)', async () => {
    const first = await upsertDayRecord(aDay());
    const second = await upsertDayRecord(aDay());

    expect(second.changed).toBe(false);
    expect(second.record.version).toBe(first.record.version);
    expect(second.record.updatedAt).toEqual(first.record.updatedAt);
  });

  it('bumps the version when a computed value genuinely changed', async () => {
    const first = await upsertDayRecord(aDay());
    const second = await upsertDayRecord(
      aDay({ computed: { ...computed, deduction: 0.5 } }),
    );

    expect(second.changed).toBe(true);
    expect(second.record.version).toBe(first.record.version + 1);
  });

  it('notices a change to the exceptions list alone', async () => {
    await upsertDayRecord(aDay());
    const second = await upsertDayRecord(aDay({ exceptions: ['MISSING_CHECK_OUT'] }));
    expect(second.changed).toBe(true);
  });

  it('leaves an override standing when it refreshes the computed value (I-6, FR-6.12)', async () => {
    const created = await upsertDayRecord(aDay());
    await setDayOverride(
      'user-1',
      '2026-08-12',
      { dayStatus: 'WFH', reason: 'Home internet outage' },
      created.record.version,
      actor,
    );

    const after = await upsertDayRecord(aDay({ computed: { ...computed, workedMinutes: 500 } }));

    expect(after.record.override.dayStatus).toBe('WFH');
    expect(after.record.override.reason).toBe('Home internet outage');
    expect(after.record.computed.workedMinutes).toBe(500);
  });
});

describe('setDayOverride', () => {
  it('records who, why and when beside the engine value (FR-6.11)', async () => {
    const created = await upsertDayRecord(aDay());
    const after = await setDayOverride(
      'user-1',
      '2026-08-12',
      { deduction: 0, reason: 'Late arrival waived under BR-8' },
      created.record.version,
      actor,
    );

    expect(after.override.deduction).toBe(0);
    expect(after.override.actorId).toBe('actor-1');
    expect(after.override.actorName).toBe('Office Administrator');
    expect(after.override.at).toBeInstanceOf(Date);
    expect(after.computed.deduction).toBe(0.25); // engine value untouched
  });

  it('requires a reason', async () => {
    const created = await upsertDayRecord(aDay());
    await expect(
      setDayOverride('user-1', '2026-08-12', { deduction: 0 }, created.record.version, actor),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('refuses a stale write', async () => {
    await upsertDayRecord(aDay());
    await expect(
      setDayOverride('user-1', '2026-08-12', { deduction: 0, reason: 'Waived' }, 99, actor),
    ).rejects.toMatchObject({ name: 'StaleWriteError' });
  });

  it('returns null for a day record that does not exist', async () => {
    expect(
      await setDayOverride('nobody', '2026-08-12', { deduction: 0, reason: 'Waived' }, 1, actor),
    ).toBeNull();
  });
});

describe('clearDayOverride', () => {
  it('removes the human decision and leaves the engine value in charge', async () => {
    const created = await upsertDayRecord(aDay());
    const overridden = await setDayOverride(
      'user-1',
      '2026-08-12',
      { dayStatus: 'WFH', reason: 'Outage' },
      created.record.version,
      actor,
    );

    const cleared = await clearDayOverride(
      'user-1',
      '2026-08-12',
      'Raised in error',
      overridden.version,
      actor,
    );

    expect(cleared.override).toBeNull();
    expect(cleared.computed.dayStatus).toBe('WFO');
  });
});

describe('listDayRecords', () => {
  it('returns the records in a range for the users asked about', async () => {
    await upsertDayRecord(aDay({ date: '2026-08-12' }));
    await upsertDayRecord(aDay({ date: '2026-08-13' }));
    await upsertDayRecord(aDay({ userId: 'user-2', date: '2026-08-12' }));

    const mine = await listDayRecords({
      userIds: ['user-1'],
      from: '2026-08-12',
      to: '2026-08-12',
    });
    expect(mine).toHaveLength(1);

    const both = await listDayRecords({ from: '2026-08-12', to: '2026-08-13' });
    expect(both).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.dayRecords.test.js`
Expected: FAIL.

- [ ] **Step 3: Add the override schema**

```js
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
```

- [ ] **Step 4: Implement the functions**

```js
export async function getDayRecord(userId, date, companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  return db.collection(COLLECTIONS.DAY_RECORDS).findOne({ companyId, userId, date, deletedAt: null });
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

/** The fields whose change makes a recalculation a real change worth a version. */
const DAY_RECORD_COMPARED = ['teamId', 'shiftId', 'dayType'];

const sameComputed = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

const sameExceptions = (a = [], b = []) =>
  a.length === b.length && [...a].sort().every((code, index) => code === [...b].sort()[index]);

/**
 * §23.3 step 11 and §19.3's requirement on the caller: when nothing changed,
 * write NOTHING. A spurious version bump would mint a fresh effectKey and let
 * a re-run post the same movement twice, and would fire a stale-write 409 at
 * anyone else holding the record.
 *
 * The override is never part of what this writes (I-6, FR-6.12) — it is set
 * only by setDayOverride, and a recalculation refreshes `computed` beneath it.
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
    const { insertedId } = await db.collection(COLLECTIONS.DAY_RECORDS).insertOne(doc);
    return { record: { ...doc, _id: insertedId }, changed: true };
  }

  const unchanged =
    DAY_RECORD_COMPARED.every(
      (field) => existing[field] === { teamId, shiftId, dayType }[field],
    ) &&
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

  const data = parse(dayOverrideSchema, input);
  const { reason, ...values } = data;
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
  if (!reason?.trim()) throw new ValidationError('A reason is required');

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
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run __tests__/database.dayRecords.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add database.js __tests__/database.dayRecords.test.js
git commit -m "feat: day records that refuse to bump a version when nothing changed (ARCHITECTURE 19.3)"
```

---

### Task 5: `engine/ledger.js` — what a day implies, and the diff

**Files:**
- Create: `engine/ledger.js`
- Test: `engine/__tests__/ledger.test.js`

**Interfaces:**
- Consumes: `LEDGER_ENTRY_TYPE`, `DAY_STATUS` from constants;
  `effective` from `utils/dayRecord.js`.
- Produces:
  - `WFH_LEAVE_TYPE` — the pseudo leave type `'WFH'` movements replay under
    (`D-13`).
  - `desiredEntriesForDay({ dayRecord, policy, leaveRecord })` →
    `Array<{ entryType, leaveType, amount, rule }>` — amounts **signed**
    (§19.1: credits positive, debits negative).
  - `reconcileLedger({ desired, existing })` →
    `{ toPost: DesiredEntry[], toReverse: ExistingEntry[] }`.

This file imports **nothing** from `database.js`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { desiredEntriesForDay, reconcileLedger, WFH_LEAVE_TYPE } from '../ledger.js';

const policy = { automaticDeductionLeaveType: 'Casual' };

const day = (computed, override = null) => ({
  computed: {
    dayStatus: 'WFO',
    workedMinutes: 0,
    lateMinutes: 0,
    deduction: 0,
    deductionRule: null,
    ...computed,
  },
  override,
});

describe('desiredEntriesForDay', () => {
  it('implies an AUTOMATIC_DEDUCTION against the team\'s configured type (FR-6.3)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ deduction: 0.25, deductionRule: 'BR-9:profileB:band1' }),
      policy,
      leaveRecord: null,
    });

    expect(entries).toEqual([
      {
        entryType: 'AUTOMATIC_DEDUCTION',
        leaveType: 'Casual',
        amount: -0.25,
        rule: 'BR-9:profileB:band1',
      },
    ]);
  });

  it('implies nothing at all for a clean day', () => {
    expect(desiredEntriesForDay({ dayRecord: day({}), policy, leaveRecord: null })).toEqual([]);
  });

  it('honours a waiver override, implying no deduction (P-25, BR-8)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ deduction: 0.25, deductionRule: 'BR-9:profileB:band1' }, { deduction: 0 }),
      policy,
      leaveRecord: null,
    });
    expect(entries).toEqual([]);
  });

  it('implies a LEAVE_AVAILED of the type on the leave record (BR-11)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'LEAVE' }),
      policy,
      leaveRecord: { leaveType: 'Sick', amount: 1 },
    });

    expect(entries).toEqual([
      { entryType: 'LEAVE_AVAILED', leaveType: 'Sick', amount: -1, rule: 'BR-11' },
    ]);
  });

  it('posts a half-day LEAVE_AVAILED alongside the deduction the worked half earned (D-11)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({
        dayStatus: 'LEAVE',
        deduction: 0.25,
        deductionRule: 'BR-9:profileB:band1',
      }),
      policy,
      leaveRecord: { leaveType: 'Casual', amount: 0.5, halfDayPeriod: 'AFTERNOON' },
    });

    expect(entries).toContainEqual({
      entryType: 'LEAVE_AVAILED',
      leaveType: 'Casual',
      amount: -0.5,
      rule: 'BR-11',
    });
    expect(entries).toContainEqual({
      entryType: 'AUTOMATIC_DEDUCTION',
      leaveType: 'Casual',
      amount: -0.25,
      rule: 'BR-9:profileB:band1',
    });
  });

  it('debits the WFH count on a work-from-home day (D-13, BR-16)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'WFH' }),
      policy,
      leaveRecord: null,
    });

    expect(entries).toEqual([
      { entryType: 'WFH_USED', leaveType: WFH_LEAVE_TYPE, amount: -1, rule: 'BR-16' },
    ]);
  });

  it('reads the effective status, so an override to WFH debits WFH (FR-6.11)', () => {
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'WFO' }, { dayStatus: 'WFH' }),
      policy,
      leaveRecord: null,
    });
    expect(entries.map((entry) => entry.entryType)).toEqual(['WFH_USED']);
  });

  it('implies no LEAVE_AVAILED when the status is LEAVE but no leave record backs it', () => {
    // A status override to LEAVE with no record is a state P-23 must not
    // produce (D-9, D-16). Implying an untyped debit would guess the type,
    // which DC-6 forbids.
    const entries = desiredEntriesForDay({
      dayRecord: day({ dayStatus: 'LEAVE' }),
      policy,
      leaveRecord: null,
    });
    expect(entries).toEqual([]);
  });
});

const existingEntry = (entryType, leaveType, amount, extra = {}) => ({
  _id: `${entryType}-${leaveType}-${amount}`,
  entryType,
  leaveType,
  amount,
  ...extra,
});

describe('reconcileLedger', () => {
  it('posts an entry the day now implies and nothing else', () => {
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        { entryType: 'AUTOMATIC_DEDUCTION', leaveType: 'Casual', amount: -0.25, rule: 'r' },
      ],
      existing: [],
    });

    expect(toPost).toHaveLength(1);
    expect(toReverse).toEqual([]);
  });

  it('does nothing at all on a re-run with the same conclusion (I-9)', () => {
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        { entryType: 'AUTOMATIC_DEDUCTION', leaveType: 'Casual', amount: -0.25, rule: 'r' },
      ],
      existing: [existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25)],
    });

    expect(toPost).toEqual([]);
    expect(toReverse).toEqual([]);
  });

  it('reverses an entry the day no longer implies, never deletes it (I-1, FR-6.8)', () => {
    const stale = existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25);
    const { toPost, toReverse } = reconcileLedger({ desired: [], existing: [stale] });

    expect(toPost).toEqual([]);
    expect(toReverse).toEqual([stale]);
  });

  it('reverses and re-posts when the amount changed', () => {
    const old = existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25);
    const { toPost, toReverse } = reconcileLedger({
      desired: [
        { entryType: 'AUTOMATIC_DEDUCTION', leaveType: 'Casual', amount: -0.5, rule: 'r' },
      ],
      existing: [old],
    });

    expect(toReverse).toEqual([old]);
    expect(toPost).toHaveLength(1);
    expect(toPost[0].amount).toBe(-0.5);
  });

  it('treats a different leave type as a different effect', () => {
    const sick = existingEntry('LEAVE_AVAILED', 'Sick', -1);
    const { toPost, toReverse } = reconcileLedger({
      desired: [{ entryType: 'LEAVE_AVAILED', leaveType: 'Casual', amount: -1, rule: 'BR-11' }],
      existing: [sick],
    });

    expect(toReverse).toEqual([sick]);
    expect(toPost[0].leaveType).toBe('Casual');
  });

  it('ignores entries already reversed, and the reversals themselves', () => {
    const reversed = existingEntry('AUTOMATIC_DEDUCTION', 'Casual', -0.25, {
      _id: 'original',
    });
    const reversal = existingEntry('REVERSAL', 'Casual', 0.25, {
      _id: 'reversal',
      reversalOf: 'original',
    });

    const { toPost, toReverse } = reconcileLedger({
      desired: [
        { entryType: 'AUTOMATIC_DEDUCTION', leaveType: 'Casual', amount: -0.25, rule: 'r' },
      ],
      existing: [reversed, reversal],
    });

    // The original is cancelled, so the day's implication is unmet and posts
    // afresh; nothing is reversed a second time.
    expect(toReverse).toEqual([]);
    expect(toPost).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run engine/__tests__/ledger.test.js`
Expected: FAIL — `engine/ledger.js` does not exist.

- [ ] **Step 3: Implement**

```js
import { DAY_STATUS, LEDGER_ENTRY_TYPE } from '../constants/index.js';
import { effective } from '../utils/dayRecord.js';

/**
 * D-13. WFH is a plain count against the per-team quota (BR-16), not a pool
 * drawn from a deposit, so it receives no ENTITLEMENT_CREDIT. It replays
 * through the same sum as every other movement with this as its pseudo leave
 * type, which is what keeps FR-5.5's balance traceable on S-14 (NFR-11)
 * rather than becoming a special case that counts day-record statuses.
 */
export const WFH_LEAVE_TYPE = 'WFH';

/**
 * §19, §23.3 step 9. What one day IMPLIES about the ledger — the desired
 * state, not a write. Reading effective() rather than computed means a human
 * decision moves the balance exactly as the engine's own conclusion would
 * (§23.1: where an override moves a balance, it posts in the normal way).
 *
 * Amounts are signed (§19.1): every one of these is a debit, so every one is
 * negative, and replay is a plain sum with no per-type sign table to get
 * wrong.
 *
 * @param {{ dayRecord: object, policy: object, leaveRecord: object|null }} input
 * @returns {Array<{ entryType: string, leaveType: string, amount: number, rule: string }>}
 */
export function desiredEntriesForDay({ dayRecord, policy, leaveRecord }) {
  const entries = [];
  const dayStatus = effective(dayRecord, 'dayStatus');
  const deduction = effective(dayRecord, 'deduction') ?? 0;

  /**
   * BR-11. The type comes from the leave record, never from policy: a record
   * is what states which balance this day spends. A LEAVE status with no
   * record behind it implies nothing rather than guessing a type (DC-6).
   */
  if (dayStatus === DAY_STATUS.LEAVE && leaveRecord) {
    entries.push({
      entryType: LEDGER_ENTRY_TYPE.LEAVE_AVAILED,
      leaveType: leaveRecord.leaveType,
      amount: -leaveRecord.amount,
      rule: 'BR-11',
    });
  }

  if (dayStatus === DAY_STATUS.WFH) {
    entries.push({
      entryType: LEDGER_ENTRY_TYPE.WFH_USED,
      leaveType: WFH_LEAVE_TYPE,
      amount: -1,
      rule: 'BR-16',
    });
  }

  /**
   * FR-6.3: the engine raises a deduction with no type stated, so it posts to
   * the single type that team configures for automatic deductions.
   *
   * D-11: this runs alongside a half-day LEAVE_AVAILED — both are real,
   * independent movements — and is skipped on a full day of leave because the
   * ladder never ran (there was no worked half to check).
   */
  if (deduction > 0) {
    entries.push({
      entryType: LEDGER_ENTRY_TYPE.AUTOMATIC_DEDUCTION,
      leaveType: policy.automaticDeductionLeaveType,
      amount: -deduction,
      rule: effective(dayRecord, 'deductionRule'),
    });
  }

  return entries;
}

/** Two entries are the same effect when these three agree (D-17). */
const identity = (entry) => `${entry.entryType}:${entry.leaveType}:${entry.amount}`;

/**
 * §23.3 step 9. Diffs what the day implies against what the ledger already
 * holds for it.
 *
 * D-17: the match is on effect — type, leave type and amount — not on the
 * source version. A version bump that leaves the movement identical must not
 * churn the ledger into cancelling pairs; NFR-11 needs S-14 to stay readable
 * as an explanation of the number.
 *
 * An entry that is no longer implied is REVERSED, never removed (I-1,
 * FR-6.8). An entry already reversed does not count as present, so the day's
 * implication posts afresh.
 */
export function reconcileLedger({ desired, existing }) {
  const reversedIds = new Set(
    existing.filter((entry) => entry.reversalOf).map((entry) => String(entry.reversalOf)),
  );

  const live = existing.filter(
    (entry) =>
      entry.entryType !== LEDGER_ENTRY_TYPE.REVERSAL && !reversedIds.has(String(entry._id)),
  );

  const desiredKeys = new Set(desired.map(identity));
  const liveKeys = new Set(live.map(identity));

  return {
    toPost: desired.filter((entry) => !liveKeys.has(identity(entry))),
    toReverse: live.filter((entry) => !desiredKeys.has(identity(entry))),
  };
}
```

- [ ] **Step 4: Add `WFH_USED` to `constants/index.js`**

`D-13`. In the `LEDGER_ENTRY_TYPE` block, after `LEAVE_AVAILED`:

```js
  /** D-13: FR-5.5's work-from-home usage, a count against BR-16's quota. */
  WFH_USED: 'WFH_USED',
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run engine/__tests__/ledger.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add engine/ledger.js engine/__tests__/ledger.test.js constants/index.js
git commit -m "feat: what a day implies for the ledger, and the diff against what exists (ARCHITECTURE 19, D-13, D-17)"
```

---

### Task 6: `database.js` — posting and reversing ledger entries

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.ledger.test.js`

**Interfaces:**
- Consumes: `ledgerEffectKey` from `utils/ledgerKey.js`.
- Produces:
  - `listLedgerEntriesForSource(sourceType, sourceId)` → `LedgerEntry[]`.
  - `postLedgerEntries(entries, { sourceType, sourceId, sourceVersion, userId, date, actor })`
    → the inserted entries. Swallows a duplicate-key failure on `effectKey`
    **and only that**, because the index firing means the effect is already
    recorded (§19.3: defence in depth).
  - `reverseLedgerEntries(entries, { actor, reason })` → the reversal entries.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import {
  listLedgerEntriesForSource,
  postLedgerEntries,
  reverseLedgerEntries,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

useTestDatabase();

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const source = {
  sourceType: 'dayRecord',
  sourceId: '64b7f9c2f1a2b3c4d5e6f7a8',
  sourceVersion: 3,
  userId: 'user-1',
  date: '2026-08-12',
  actor,
};

const deduction = {
  entryType: 'AUTOMATIC_DEDUCTION',
  leaveType: 'Casual',
  amount: -0.25,
  rule: 'BR-9:profileB:band1',
};

describe('postLedgerEntries', () => {
  it('writes a signed entry carrying its source and effect key', async () => {
    const [entry] = await postLedgerEntries([deduction], source);

    expect(entry.amount).toBe(-0.25);
    expect(entry.sourceType).toBe('dayRecord');
    expect(entry.sourceVersion).toBe(3);
    expect(entry.effectKey).toContain('v3');
    expect(entry.reversalOf).toBeNull();
  });

  it('refuses the same effect twice without throwing (I-9, §19.3)', async () => {
    await postLedgerEntries([deduction], source);
    const second = await postLedgerEntries([deduction], source);

    expect(second).toEqual([]);
    expect(await listLedgerEntriesForSource('dayRecord', source.sourceId)).toHaveLength(1);
  });

  it('permits the same movement at a new source version (a real correction)', async () => {
    await postLedgerEntries([deduction], source);
    await postLedgerEntries([{ ...deduction, amount: -0.5 }], { ...source, sourceVersion: 4 });

    expect(await listLedgerEntriesForSource('dayRecord', source.sourceId)).toHaveLength(2);
  });
});

describe('reverseLedgerEntries', () => {
  it('appends the mirror movement, leaving the original untouched (§19.4)', async () => {
    const [original] = await postLedgerEntries([deduction], source);
    const [reversal] = await reverseLedgerEntries([original], {
      actor,
      reason: 'Punch corrected',
    });

    expect(reversal.amount).toBe(0.25);
    expect(reversal.entryType).toBe('REVERSAL');
    expect(String(reversal.reversalOf)).toBe(String(original._id));
    expect(reversal.reason).toBe('Punch corrected');

    const all = await listLedgerEntriesForSource('dayRecord', source.sourceId);
    expect(all).toHaveLength(2);
    expect(all.find((entry) => String(entry._id) === String(original._id)).amount).toBe(-0.25);
  });

  it('carries no effect key, so a movement may be reversed and re-applied (§19.3)', async () => {
    const [original] = await postLedgerEntries([deduction], source);
    const [reversal] = await reverseLedgerEntries([original], { actor, reason: 'Corrected' });

    expect(reversal.effectKey).toBeUndefined();
  });

  it('sums to zero after a reversal, which is what replay will see (I-2)', async () => {
    const [original] = await postLedgerEntries([deduction], source);
    await reverseLedgerEntries([original], { actor, reason: 'Corrected' });

    const all = await listLedgerEntriesForSource('dayRecord', source.sourceId);
    expect(all.reduce((total, entry) => total + entry.amount, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.ledger.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
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
 * §19.1. Appends movements. Never updates one — FR-6.8 and DC-3 make the
 * ledger strictly append-only, and a movement is cancelled only by its
 * reverse.
 *
 * A duplicate-key failure on effectKey is SWALLOWED and only that: the index
 * firing means this exact effect at this exact source version is already
 * recorded, so refusing it is the correct outcome rather than an error
 * (§19.3 — defence in depth behind reconcileLedger). Any other write failure
 * propagates.
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
      const { insertedId } = await db.collection(COLLECTIONS.LEDGER_ENTRIES).insertOne(doc);
      written.push({ ...doc, _id: insertedId });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // Already recorded at this source version. Correct, not an error.
    }
  }

  return written;
}

/**
 * §19.4. The original is untouched; the reverse is appended. S-14 shows both,
 * with the reversal marked, which is how NFR-11 — "why is this number what it
 * is" — stays answerable.
 *
 * A reversal deliberately carries NO effectKey: a movement may legitimately
 * be reversed and re-applied, and the partial unique index excludes it by the
 * field's absence (§19.3).
 */
export async function reverseLedgerEntries(
  entries,
  { actor, reason },
  companyId = DEFAULT_COMPANY_ID,
) {
  if (entries.length === 0) return [];
  if (!reason?.trim()) {
    throw new ValidationError('A reversing entry requires a reason.');
  }

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

  const { insertedIds } = await db.collection(COLLECTIONS.LEDGER_ENTRIES).insertMany(docs);

  return docs.map((doc, index) => ({ ...doc, _id: insertedIds[index] }));
}
```

Import `ledgerEffectKey` from `./utils/ledgerKey.js` and `LEDGER_ENTRY_TYPE`
into `database.js`.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run __tests__/database.ledger.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add database.js __tests__/database.ledger.test.js
git commit -m "feat: append-only ledger writes, cancelled by reversal and never edited (ARCHITECTURE 19)"
```

---

### Task 7: `database.js` — the recalculation input loader

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.recalculationInputs.test.js`

**Interfaces:**
- Consumes: existing `listTeamAssignments`, `listShiftAssignments`,
  `listHolidays`, `getWeeklyOffPattern`, `getTeamPolicy`, `getUserById`.
- Produces:
  - `resolveTeamOnDate(teamAssignments, date, fallbackTeamId)` → `teamId|null`
    (exported for its own test; pure).
  - `resolveShiftAssignmentsWithShifts(userId)` →
    `Array<{ effectiveFrom, effectiveTo, shift }>` with the shift document and
    its team's `midnightCrossingWindowHours` attached as
    `shift.crossingWindowHours` — the exact shape `resolveWorkDate` documents
    it needs (Branch 1, Task 2).
  - `loadRecalculationInputs(userId, { from, to })` → everything one user's
    recalculation reads, in one call:
    `{ user, tenures, teamAssignments, shiftAssignments, punches, leaveRecords, dayRecords, policyByTeam, holidaysByTeam, weeklyOffByTeam }`.

Why one loader: `NFR-3` puts a full-company month under two seconds, and a
per-date round trip for policy and calendar cannot meet that. The engine gets
plain objects and stays testable without a database.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { resolveTeamOnDate } from '../database.js';

describe('resolveTeamOnDate', () => {
  const assignments = [
    { teamId: 'team-a', effectiveFrom: '2025-01-01', effectiveTo: '2026-05-31' },
    { teamId: 'team-b', effectiveFrom: '2026-06-01', effectiveTo: null },
  ];

  it('returns the team held ON the date, not the current one (§23.3 step 1)', () => {
    expect(resolveTeamOnDate(assignments, '2026-03-01', 'team-b')).toBe('team-a');
    expect(resolveTeamOnDate(assignments, '2026-07-01', 'team-b')).toBe('team-b');
  });

  it('falls back to the user\'s current team for a date before any assignment', () => {
    expect(resolveTeamOnDate(assignments, '2024-01-01', 'team-b')).toBe('team-b');
  });

  it('returns null when there is no assignment and no fallback', () => {
    expect(resolveTeamOnDate([], '2026-03-01', null)).toBeNull();
  });
});
```

Plus an integration test with the real database, exercising the loader end to
end:

```js
import { describe, expect, it } from 'vitest';
import {
  createShift,
  createTeam,
  createUser,
  loadRecalculationInputs,
  updateTeamPolicy,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

useTestDatabase();

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('loadRecalculationInputs', () => {
  it('returns the policy, calendar and pattern of the team held on the date', async () => {
    const team = await createTeam({ name: 'General' }, actor);
    await updateTeamPolicy(
      String(team._id),
      { automaticDeductionLeaveType: 'Casual', midnightCrossingWindowHours: 8 },
      actor,
    );
    const user = await createUser(
      {
        fullName: 'Loader Test',
        employeeCode: 'E-902',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: 'EMPLOYEE',
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
      },
      actor,
    );

    const inputs = await loadRecalculationInputs(String(user._id), {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    expect(inputs.user.employeeCode).toBe('E-902');
    expect(inputs.tenures).toHaveLength(1);
    expect(inputs.policyByTeam[String(team._id)].automaticDeductionLeaveType).toBe('Casual');
    expect(inputs.holidaysByTeam[String(team._id)]).toEqual([]);
  });

  it('attaches the team\'s crossing window to each shift, as resolveWorkDate requires', async () => {
    const team = await createTeam({ name: 'Night' }, actor);
    await updateTeamPolicy(String(team._id), { midnightCrossingWindowHours: 8 }, actor);
    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Graveyard',
        startTime: '19:00',
        endTime: '04:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );
    const user = await createUser(
      {
        fullName: 'Night Worker',
        employeeCode: 'E-903',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: 'EMPLOYEE',
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );

    const inputs = await loadRecalculationInputs(String(user._id), {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    expect(inputs.shiftAssignments[0].shift.crossingWindowHours).toBe(8);
    expect(inputs.shiftAssignments[0].shift.startTime).toBe('19:00');
  });
});
```

Note: check `createShift`'s real required fields against `shiftSchema` in
`database.js` before writing this test, and match them exactly.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.recalculationInputs.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
/**
 * §23.3 step 1: the team held ON that date, not the user's current one. A
 * report of March must not change because someone moved team in June
 * (FR-3.14: a team move never rewrites history).
 */
export function resolveTeamOnDate(teamAssignments, date, fallbackTeamId = null) {
  const covering = teamAssignments.find(
    (assignment) =>
      assignment.effectiveFrom <= date &&
      (assignment.effectiveTo === null || assignment.effectiveTo >= date),
  );

  return covering?.teamId ?? fallbackTeamId ?? null;
}

/**
 * The shape `resolveWorkDate` documents: each assignment carrying its shift,
 * and each shift carrying its TEAM's midnight-crossing window as
 * `crossingWindowHours`. §8.2 — the engine never reads policy itself, so the
 * value is resolved and attached here.
 *
 * An unset window stays undefined rather than defaulting to a number: §8.3
 * and DC-6 require the missing configuration to surface as
 * SHIFT_CONFIGURATION_INCOMPLETE, and a default would hide it.
 */
export async function resolveShiftAssignmentsWithShifts(
  userId,
  { companyId = DEFAULT_COMPANY_ID } = {},
) {
  const assignments = await listShiftAssignments(userId, companyId);
  if (assignments.length === 0) return [];

  const db = await getDb();
  const shiftIds = [...new Set(assignments.map((assignment) => assignment.shiftId))]
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
    policies.map((policy) => [policy.teamId, policy.midnightCrossingWindowHours]),
  );

  return assignments
    .map((assignment) => {
      const shift = shiftById.get(String(assignment.shiftId));
      if (!shift) return null;
      return {
        ...assignment,
        shift: { ...shift, crossingWindowHours: windowByTeam.get(shift.teamId) },
      };
    })
    .filter(Boolean);
}

/**
 * Everything one user's recalculation reads, in one round trip per collection
 * rather than per date. NFR-3 puts a full-company month under two seconds,
 * which a per-date query cannot meet.
 *
 * The engine receives plain objects and stays database-free (§8.2), which is
 * what lets Branch 1's functions be tested without Mongo at all.
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
  const shiftAssignments = await resolveShiftAssignmentsWithShifts(userId, { companyId });

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

  const dayRecords = await listDayRecords({ userIds: [userId], from, to, companyId });
  const leaveRecords = await db
    .collection(COLLECTIONS.LEAVE_RECORDS)
    .find({ companyId, userId, date: { $gte: from, $lte: to }, deletedAt: null })
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
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run __tests__/database.recalculationInputs.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add database.js __tests__/database.recalculationInputs.test.js
git commit -m "feat: load a recalculation's inputs in one pass, with policy resolved for the engine (ARCHITECTURE 8.2)"
```

---

### Task 8: `engine/recalculate.js` — the real body

**Files:**
- Modify: `engine/recalculate.js` (replace the no-op body; keep the docstring's
  decisions, update what is now untrue)
- Test: `__tests__/engine.recalculate.test.js` (real database — it writes)

**Interfaces:**
- Consumes: everything from Tasks 1–7 and all of Branch 1.
- Produces: `recalculateDays(userId, dateRange, options)` →
  `{ recalculated: number }`, where `options` is
  `{ teamId?: string, materialiseUsers?: string[], actor?: object, reason?: string }`.

The algorithm, per §23.3 and the design record's §3, with `D-18`'s
materialisation rule:

```
recalculateDays(userId, { from, to }, options):
  users = userId ? [userId] : every tracked, live user (optionally on options.teamId)
  for each user:
    inputs = loadRecalculationInputs(user, widened range)
    re-resolve the work date of every punch whose instant falls in the widened
      window, persisting it when it changed                       §23.3 step 3
    dates = every date in [from, to] that
        - lies inside the employment period (FR-2.12), AND
        - the user is tracked for (FR-2.10), AND
        - already has a day record, OR has a live punch, OR has a leave
          record, OR the user is in options.materialiseUsers       D-18
    for each date:
      teamId  = resolveTeamOnDate(...)                             step 1
      shift   = the assignment covering this date
      punches = those whose work date is this date                 step 2
      flagDuplicates -> persist isDuplicate                        FR-4.7
      pairPunches -> workedMinutes, exceptions                     step 4
      dayType = resolveDayType(...)                                step 5
      leaveRecord = the record for this date, if any               D-9
      dayStatus = resolveDayStatus(...)                            step 6
      requirement = effectiveRequirement(shiftWindow + required, halfDayPeriod)
      lateness / early / short day                                 step 7
      deduction = full-day LEAVE ? 0 : deductionFor(...)           step 8, D-11
      { record, changed } = upsertDayRecord(...)                   step 11
      desired = desiredEntriesForDay(...)
      { toPost, toReverse } = reconcileLedger(desired, existing)   step 9
      reverse, then post
```

- [ ] **Step 1: Write the failing tests**

The suite must cover, at minimum, these cases — each one a named `it`:

```js
import { describe, expect, it } from 'vitest';
import { recalculateDays } from '../engine/recalculate.js';
import {
  createPunch,
  createShift,
  createTeam,
  createUser,
  createLeaveRecord,
  getDayRecord,
  listLedgerEntriesForSource,
  setDayOverride,
  assignUserShift,
  updateTeamPolicy,
  setWeeklyOffPattern,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

useTestDatabase();
```

Build one fixture helper `aTrackedUserOnADayShift()` creating: a team with a
complete policy (`automaticDeductionLeaveType: 'Casual'`,
`midnightCrossingWindowHours: 8`, `duplicatePunchWindowMinutes: 10`,
`shortDayThresholdPercent: 89`, the seed `leaveDeductionLadder`), a 09:00–18:00
`Asia/Karachi` shift with `requiredDailyMinutes: 540` and `graceMinutes: 30`, a
tracked user joined 2025-01-01 assigned to both, and a Mon–Fri weekly-off
pattern of `[0, 6]`.

Cases:

1. **A clean day produces a WFO record and no ledger entry.** Punch in at
   09:00 PKT (`04:00Z`), out at 18:00 PKT (`13:00Z`). Assert
   `computed.dayStatus === 'WFO'`, `workedMinutes === 540`, `deduction === 0`,
   and zero ledger entries.
2. **Worked example A end to end (§18.3).** In 11:00 PKT, out 17:00 PKT.
   Assert `lateMinutes === 120`, `workedMinutes === 360`, `isShortDay === true`,
   `deduction === 0.25`, and exactly one `AUTOMATIC_DEDUCTION` of `-0.25`
   against `Casual`.
3. **Idempotency (`I-9`, `NFR-15`).** Run the same recalculation twice. Assert
   the day record's `version` is identical after both runs and that the ledger
   holds exactly one entry.
4. **An override survives and the computed value refreshes (`I-6`, `FR-6.12`).**
   Recalculate, override `dayStatus` to `WFH`, add a punch, recalculate again.
   Assert `override.dayStatus === 'WFH'` still, and that
   `computed.workedMinutes` reflects the new punch.
5. **A correction reverses and re-posts (§19.4).** Produce a `-0.25` deduction,
   edit the check-in earlier so the deduction becomes `0`, recalculate. Assert
   the original entry still exists untouched, a `REVERSAL` of `+0.25` exists,
   and the entries sum to zero.
6. **A missing check-out raises an exception and never zeroes the day (`FR-4.8`,
   `I-5`).** One check-in only. Assert
   `exceptions` contains `MISSING_CHECK_OUT` and the day is not silently `0`
   worked minutes with a full deduction — assert the status is `WFO`, because
   a live punch exists.
7. **A duplicate punch is flagged, not deleted (`FR-4.7`, `I-1`).** Two
   check-ins four minutes apart against a ten-minute window. Assert the second
   punch's `isDuplicate` is true, that it still exists, and that pairing
   ignored it.
8. **A weekly-off day with no punches produces no record unless materialised
   (`D-18`).** Recalculate a Saturday with no punches: assert
   `getDayRecord` is `null`. Recalculate again with
   `materialiseUsers: [userId]`: assert a record now exists with
   `dayStatus === 'WEEKLY_OFF'`.
9. **A holiday worked produces `HOLIDAY_WORK` (§16).**
10. **A full day of leave skips the ladder entirely (`D-11`, `BR-11`).** Record
    a full day of `Casual` leave on a date with no punches. Assert
    `dayStatus === 'LEAVE'`, `deduction === 0`, and exactly one
    `LEAVE_AVAILED` of `-1` against `Casual` — **no** `AUTOMATIC_DEDUCTION`.
11. **A half day of leave runs the ladder on the worked half (`D-11`).** Leave
    with `amount: 0.5, halfDayPeriod: 'AFTERNOON'`; punch in at 11:00 PKT and
    out at 13:30 PKT. Assert both a `LEAVE_AVAILED` of `-0.5` and an
    `AUTOMATIC_DEDUCTION` exist, and that lateness was measured from 09:00 —
    `lateMinutes === 120` — against a 270-minute requirement.
12. **A date outside the employment period gets no record (`FR-2.12`).**
13. **An untracked user gets no record (`FR-2.10`).**
14. **A date with no shift assigned raises `NO_SHIFT_ASSIGNED` rather than
    guessing a status (`FR-3.12`).** Assert `exceptions` contains it and
    `computed.dayStatus` is not invented.
15. **Cancelling leave reverses its `LEAVE_AVAILED`.**
16. **`userId: null` recalculates every tracked user** in the range, and
    `options.teamId` narrows it to one team.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run __tests__/engine.recalculate.test.js`
Expected: FAIL — the stub returns `{ recalculated: 0 }` and writes nothing, so
every assertion about a day record fails.

- [ ] **Step 3: Implement `engine/recalculate.js`**

Keep the existing docstring's `D-2` paragraph and `@param` block; replace the
"It does nothing yet" paragraph with what it now does, and add `D-18`'s
materialisation rule. The body composes the pieces already built — it contains
**no** calculation of its own, only orchestration:

```js
import { addDays, eachDayOfInterval, format, parseISO, subDays } from 'date-fns';
import { DAY_STATUS, EXCEPTION_CODE, PUNCH_TYPE } from '../constants/index.js';
import {
  getLeaveRecordsForUserDates,
  listLedgerEntriesForSource,
  listPunchesInInstantRange,
  listTrackedUserIds,
  loadRecalculationInputs,
  postLedgerEntries,
  reverseLedgerEntries,
  setPunchDerivedFields,
  upsertDayRecord,
  resolveTeamOnDate,
} from '../database.js';
import { resolveDayStatus, resolveDayType } from './classify.js';
import {
  flagDuplicates,
  impossibleDurationExceptions,
  pairPunches,
  workedMinutes as sumWorkedMinutes,
} from './duration.js';
import { deductionFor } from './ladders.js';
import { desiredEntriesForDay, reconcileLedger } from './ledger.js';
import {
  clockedPercent,
  earlyMinutes,
  effectiveRequirement,
  isCompliant,
  isShortDay,
  lateMinutes,
  latenessPercent,
} from './punctuality.js';
import { shiftWindow } from './workDate.js';
import { isWithinEmploymentPeriod } from '../utils/employment.js';
```

Write the orchestrator as small named helpers inside the file — one per
pipeline stage — so no single function exceeds what a reader can hold:
`resolveWorkDatesForPunches`, `datesToVisit`, `computeOneDay`,
`reconcileOneDay`. `recalculateDays` itself is the loop over users and dates.

Key details the tests above will hold you to:

- The widened load window is `from - 2 days` to `to + 2 days` in instants, so a
  night shift's punches either side of the range are re-resolved (§13).
- `deduction` is `0` when the effective status is `LEAVE` **and** the leave
  record's `amount` is `1` (`D-11`: a full day has no worked half).
- `attended` for `deductionFor` is "any live punch exists on the date".
- `exceptions` is rebuilt from scratch every run and never appended to
  (§27.2 — derived, not accumulated).
- The ledger source is `{ sourceType: 'dayRecord', sourceId: record._id,
  sourceVersion: record.version }`, read after `upsertDayRecord` so the version
  is the one actually stored.
- Reversals need a reason; use the caller's `options.reason` and fall back to
  `'Recalculated after a change to the day'`.
- The actor for engine-posted entries is `options.actor` and falls back to
  `{ userId: 'system', name: 'Pulse engine' }` — a recalculation triggered by
  a policy change has no single human author for each entry it moves.
- `recalculated` counts day records whose `changed` was true.

Add `listTrackedUserIds({ teamId })` to `database.js` in this task if it does
not exist — a `find` over live, tracked users returning ids only.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run __tests__/engine.recalculate.test.js`
Expected: PASS, all 16 cases.

- [ ] **Step 5: Run the whole suite — nothing before this may regress**

Run: `npm test`
Expected: every pre-existing test still passes. The holiday, policy and
weekly-off routes already call `recalculateDays`; with a real body they will
now do real work inside those tests, so watch for newly slow or newly failing
cases there and fix the cause rather than the assertion.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add engine/recalculate.js database.js __tests__/engine.recalculate.test.js
git commit -m "feat: the real recalculation entry point, idempotent and override-safe (ARCHITECTURE 23.3)"
```

---

### Task 9: `/api/punches` — create, edit, soft delete (`P-21`, `P-22`)

**Files:**
- Create: `app/api/punches/route.js`, `app/api/punches/[id]/route.js`,
  `app/api/punches/[id]/soft-delete/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.punches.test.js`

**Interfaces:**
- Consumes: `createPunch`, `updatePunch`, `softDeletePunch`, `getPunchById`,
  `recalculateDays`.
- Produces the contract:

| Method | Route | Permission | Body | Success |
| ------ | ----- | ---------- | ---- | ------- |
| `POST` | `/api/punches` | `attendance.write` | `{ userId, at, type, source }` | `201` + punch |
| `PATCH` | `/api/punches/[id]` | `attendance.write` | `{ at?, type?, userId?, reason, version }` | `200` + punch |
| `POST` | `/api/punches/[id]/soft-delete` | `attendance.write` | `{ reason, version }` | `200` + punch |

Errors: `401` unauthenticated, `403` naming the permission, `404` out of
scope or unknown id, `400` validation with the specific message, `409` stale
write carrying `current`.

- [ ] **Step 1: Write the failing contract tests**

Follow `__tests__/api.teams.test.js` exactly: `vi.mock('../session.js')`,
`signedInAs(held(...))`, dynamic route imports, `params(id)` returning a
promise. Assert, at minimum:

- `POST` with `attendance.write` returns `201` and the punch's shape.
- `POST` without the permission returns `403` and the body names
  `attendance.write`.
- `POST` with an unknown punch type returns `400` and the message says so.
- `POST` **recalculates both days when an edit moves a punch** (`FR-4.12`,
  MVP criterion 18): `PATCH` a punch from 2026-08-12 to 2026-08-13 and assert
  a day record exists for **both** dates afterwards.
- `PATCH` with a stale `version` returns `409` with `current` populated.
- `PATCH` on an unknown id returns `404`.
- `POST /soft-delete` without a reason returns `400`.
- `POST /soft-delete` returns `200` and the punch is excluded from the day's
  pairing afterwards — assert the day record's `workedMinutes` dropped.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run __tests__/api.punches.test.js`
Expected: FAIL — the route modules do not exist.

- [ ] **Step 3: Implement the routes**

Each handler follows the house shape exactly — `requireActor`,
`assertPermission`, `assertRecordInScope` against `{ userId, teamId }` of the
punch's owner, delegate to `database.js`, `errorResponse` in the catch.

The recalculation call is what makes `FR-4.12` true, and it is the reason the
`PATCH` handler reads the punch **before** updating it:

```js
    const before = await getPunchById(id);
    if (!before) throw new NotFoundError();

    const after = await updatePunch(id, body, version, actor);

    /**
     * FR-4.12 and MVP criterion 18: a punch that moved changes TWO days — the
     * one it left and the one it joined. Recalculating only the new date
     * would leave the old day still counting hours nobody worked.
     *
     * The instants are used, not the stored work dates: `before.workDate` may
     * be null (never resolved) and the new date is not known until the engine
     * resolves it, so the window covers both instants with a day either side
     * for a crossing shift.
     */
    const touched = [before.at, after.at].sort((a, b) => a - b);
    await recalculateDays(after.userId, {
      from: format(subDays(touched[0], 1), 'yyyy-MM-dd'),
      to: format(addDays(touched[1], 1), 'yyyy-MM-dd'),
    });
```

- [ ] **Step 4: Add the route rules**

In `authz/routes.js`, above the dynamic API patterns:

```js
  {
    pattern: /^\/api\/punches\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.ATTENDANCE_READ,
  },
  { pattern: /^\/api\/punches(\/[^/]+)?$/, permission: PERMISSIONS.ATTENDANCE_READ },
```

The path gates on `attendance.read` and each handler asserts
`attendance.write`, matching how `/api/teams` already splits read from write
(the comment in that file explains why: the permission a mutation needs
depends on the method, not the path).

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run __tests__/api.punches.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add app/api/punches authz/routes.js __tests__/api.punches.test.js
git commit -m "feat: punch API, recalculating both the day it left and the day it joined (FR-4.12)"
```

---

### Task 10: `/api/attendance` — day reads and overrides (`P-23`–`P-25`)

**Files:**
- Create: `app/api/attendance/route.js`,
  `app/api/attendance/[userId]/[date]/route.js`,
  `app/api/attendance/[userId]/[date]/override/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.attendance.test.js`

**Interfaces:**
- Produces the contract:

| Method | Route | Permission | Returns |
| ------ | ----- | ---------- | ------- |
| `GET` | `/api/attendance?from&to&teamId&userId` | `attendance.read` | `{ items, total }` of day records |
| `GET` | `/api/attendance/[userId]/[date]` | `attendance.read` | `{ dayRecord, punches, leaveRecord, ledgerEntries }` — everything `S-12` shows |
| `PATCH` | `/api/attendance/[userId]/[date]/override` | `attendance.write` | the day record |
| `DELETE` | `/api/attendance/[userId]/[date]/override` | `attendance.write` | the day record, override cleared |

`GET /api/attendance` accepts `materialise=true` for `S-10`, which passes
`materialiseUsers` into `recalculateDays` for that team and date — `D-15`'s
one bounded call.

- [ ] **Step 1: Write the failing contract tests**

Assert:

- `GET` a range returns `{ items, total }` and only the records in it.
- `GET` with `materialise=true` and a `teamId` creates the missing records for
  every tracked member of that team on that date, `ABSENT` included (`D-15`).
- `GET` the day detail returns the punches, the day record and its ledger
  entries together.
- `GET` the day detail for a date with no record returns `404` with a body
  that says a date in a tenure gap carries no record (`FR-2.12`).
- `PATCH` the override with `attendance.write` returns `200`; the engine value
  underneath is unchanged.
- `PATCH` the override **without a reason** returns `400`.
- `PATCH` the override without `attendance.write` returns `403` naming it.
- `PATCH` the override **posts the ledger movement it implies** — override a
  status to `WFH` and assert a `WFH_USED` entry of `-1` exists afterwards
  (`§23.1`: an override that moves a balance posts in the normal way).
- `PATCH` with a stale version returns `409` with `current`.
- `DELETE` the override returns `200`, `override` is `null`, and the ledger
  entry the override implied is **reversed**, not deleted.

- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement the routes** — each override handler calls
  `setDayOverride`/`clearDayOverride` then `recalculateDays` for that one
  date, which is what reconciles the ledger.
- [ ] **Step 4: Add the route rules** for `/api/attendance…` gating on
  `ATTENDANCE_READ`, with the static `override` pattern above the dynamic one.
- [ ] **Step 5: Run and watch them pass**
- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add app/api/attendance authz/routes.js __tests__/api.attendance.test.js
git commit -m "feat: attendance read and day override API, posting what an override implies (FR-6.10, FR-6.11)"
```

---

### Task 11: `/api/leave-records` — record and cancel (`P-26`, `D-16`)

**Files:**
- Create: `app/api/leave-records/route.js`,
  `app/api/leave-records/[id]/soft-delete/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.leaveRecords.test.js`

**Interfaces:**

| Method | Route | Permission | Body | Success |
| ------ | ----- | ---------- | ---- | ------- |
| `POST` | `/api/leave-records` | `leave.write` | `{ userId, date, leaveType, amount, halfDayPeriod?, reason }` | `201` |
| `POST` | `/api/leave-records/[id]/soft-delete` | `leave.write` | `{ reason, version }` | `200` |

- [ ] **Step 1: Write the failing contract tests.** Assert: `201` and a
  `LEAVE_AVAILED` entry of the right sign and type exists afterwards; `403`
  without `leave.write` naming it; `400` for a half day with no period; `400`
  for a second record on the same date, with the message naming the existing
  type; cancelling reverses the `LEAVE_AVAILED` rather than deleting it, and
  the day reverts to the status the punches imply.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**, calling `recalculateDays(userId, { from: date, to: date })`
  after both writes.
- [ ] **Step 4: Add the route rule** gating on `LEAVE_READ`.
- [ ] **Step 5: Run and watch them pass**
- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add app/api/leave-records authz/routes.js __tests__/api.leaveRecords.test.js
git commit -m "feat: record and cancel a day of leave as a real engine input (D-9, D-16)"
```

---

### Task 12: Scope the holiday and policy recalculations to their team

**Files:**
- Modify: `app/api/holidays/route.js`, `app/api/holidays/[id]/route.js`,
  `app/api/holidays/[id]/soft-delete/route.js`,
  `app/api/teams/[id]/policy/route.js`, `app/api/teams/[id]/weekly-off/route.js`
- Test: extend `__tests__/api.teams.test.js`

These routes already call `recalculateDays(null, …)`, written against the stub.
With a real body, `null` now means *every tracked user in the company* — but
`ARCHITECTURE.md` §23.4 scopes a calendar change to **that team** and a policy
change to **that team from its effective date**. Fixing this is
`CLAUDE.md`'s "clean as you go", and leaving it would make the widest fan-out
in the system wider still.

- [ ] **Step 1: Write the failing test** — two teams, a holiday added to one,
  assert only that team's members were recalculated (a member of the other
  team has no day record for the date).
- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Pass `{ teamId }`** through each of those five call sites.
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add app/api __tests__/api.teams.test.js
git commit -m "fix: scope a calendar or policy recalculation to the team it belongs to (ARCHITECTURE 23.4)"
```

---

### Task 13: Documentation, and the midpoint verification

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`,
  `docs/superpowers/specs/2026-08-13-phase-5-design.md`

- [ ] **Step 1: Record `D-16`, `D-17` and `D-18` in the design record**

Append them to `docs/superpowers/specs/2026-08-13-phase-5-design.md` §2, in
the same format as `D-9`–`D-15`, each with its *If overruled* note. Amend that
document's §1 branch table so Branch 2 lists `leaveRecords` and Branch 4 no
longer claims it (`D-16`).

- [ ] **Step 2: Correct `ARCHITECTURE.md` where the build proved it wrong**

§34 requires this in the same change. At minimum: §23.3's step list gains
`D-18`'s materialisation rule and the note that step 10 (PTO/CTO proposal) is
`P6` and not called; §19.3 gains a pointer to `D-17` explaining that
reconciliation matches on effect rather than on source version.

- [ ] **Step 3: Update `README.md`'s feature table**

```
| Attendance capture (`FR-4.x`) | Punch capture, day records and the ledger built; screens next |
| Day classification (`FR-5.x`) | Built and wired to real attendance data |
```

- [ ] **Step 4: Full verification**

```bash
npm run lint     # must exit 0 — check the exit code, do not pipe it away
npm test         # every test, including all Phase 4 suites
npm run build
```

- [ ] **Step 5: Confirm the engine stayed pure where it must be**

Run: `grep -rn "database" engine/*.js`
Expected: matches in `recalculate.js` only. `workDate.js`, `duration.js`,
`classify.js`, `punctuality.js`, `ladders.js` and `ledger.js` must not appear —
the orchestrator is the only engine file permitted to touch storage.

- [ ] **Step 6: Commit and report**

```bash
git add README.md ARCHITECTURE.md docs/superpowers/specs/2026-08-13-phase-5-design.md
git commit -m "docs: record D-16 to D-18 and correct the architecture where the build disagreed"
```

Report to Ahmar: the data, engine and API half of Branch 2 is complete and
green; `S-10`, `S-12` and `P-21`–`P-25`'s screens follow in Branch 2b on the
same branch.

---

## Self-review

**Spec coverage.** `FR-4.1` Task 9 · `FR-4.6` Task 8 (pairing aggregates) ·
`FR-4.7` Tasks 2, 8 · `FR-4.8` Task 8 · `FR-4.9` Task 10 · `FR-4.12` Tasks 2,
9 · `FR-5.1`–`FR-5.3` Task 8 · `FR-5.5` Task 5 (`WFH_USED`) · `FR-5.8` Task 8 ·
`FR-5.9` Task 8 · `FR-6.3` Task 5 · `FR-6.8` Task 6 · `FR-6.10`/`FR-6.11` Tasks
4, 10 · `FR-6.12` Tasks 4, 8 · `FR-2.10`/`FR-2.12` Task 8 · `FR-3.12` Task 8 ·
`BR-9` Task 8 · `BR-11` Task 5 · `BR-16` Task 5 · `I-1` Tasks 2, 5, 6 · `I-5`
Task 8 · `I-6` Tasks 4, 8 · `I-9` Tasks 6, 8.

**Deliberately not here** (Branch 2b or later): `S-09`, `S-11` (Branch 3);
balance replay, accrual, entitlement crediting `D-12`, `S-13`, `S-14`
(Branch 4); PTO/CTO proposal, `S-05` (Phase 6). `recalculateDays` calls
nothing from §21 or §22, per the design record's §3.

**Type consistency.** `effective(dayRecord, field)` is used with that exact
signature in Tasks 1, 5 and 8. `upsertDayRecord` returns `{ record, changed }`
in Tasks 4 and 8. `desiredEntriesForDay` and `reconcileLedger` take and return
the shapes Task 5 defines and Task 8 consumes. `resolveWorkDate`'s
`shift.crossingWindowHours` (Branch 1) is produced by Task 7's
`resolveShiftAssignmentsWithShifts` and by nothing else.

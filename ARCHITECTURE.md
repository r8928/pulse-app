# Pulse — Architecture and Implementation Guide

How every remaining part of Pulse is built, so that the app is finished the
right way rather than merely finished.

| Document | Answers |
| -------- | ------- |
| [`spec.md`](spec.md) | **What** the system must do. `FR-`, `NFR-`, `BR-`, `DC-` requirements. |
| [`list-of-screens.md`](list-of-screens.md) | **Where** each requirement surfaces. 9 modules, 22 screens, 47 popups. |
| **`ARCHITECTURE.md`** (this file) | **How** to build it without breaking the other two. |
| [`DESIGN.md`](DESIGN.md) | How it **looks**. Design tokens. Do not change while building. |
| [`CLAUDE.md`](CLAUDE.md) | Coding rules that apply to every change. |

**Precedence.** Where this document and `spec.md` disagree, `spec.md` wins and
this document is wrong — fix it. Where this document is silent, follow
`CLAUDE.md`. Where both are silent, prefer the pattern the boilerplate already
established over inventing a new one.

---

## Table of contents

**Part 0 — [Before you start](#part-0--before-you-start)**
[0.1 Decisions taken here](#01-decisions-taken-here) ·
[0.2 What already exists](#02-what-already-exists) ·
[0.3 The nine invariants](#03-the-nine-invariants)

**Part I — [Layers](#part-i--layers)**
[1 Layer map](#1-layer-map) ·
[2 Data access](#2-data-access) ·
[3 Authorization](#3-authorization) ·
[4 Audit](#4-audit) ·
[5 Soft delete](#5-soft-delete-and-the-three-record-classes) ·
[6 Concurrency](#6-concurrency) ·
[7 Time](#7-time) ·
[8 Policy as data](#8-policy-as-data) ·
[9 API contracts](#9-api-contracts) ·
[10 UI conventions](#10-ui-conventions) ·
[11 Testing](#11-testing)

**Part II — [The engine](#part-ii--the-engine)**
[12 Overview](#12-engine-overview) ·
[13 Work date](#13-work-date-resolution) ·
[14 Worked duration](#14-worked-duration) ·
[15 Day type](#15-day-type) ·
[16 Day status](#16-day-status) ·
[17 Lateness and short days](#17-lateness-and-short-days) ·
[18 Deduction ladder](#18-the-leave-deduction-ladder) ·
[19 The ledger](#19-the-ledger) ·
[20 Accrual](#20-accrual-carry-forward-and-lapse) ·
[21 PTO](#21-pto) ·
[22 CTO](#22-cto) ·
[23 Overrides](#23-overrides-and-recalculation)

**Part III — [Modules](#part-iii--modules)**
[24 M-6 Organisation](#24-m-6--organisation-and-policy) ·
[25 M-4 Attendance](#25-m-4--attendance) ·
[26 M-5 Leave](#26-m-5--leave-and-balances) ·
[27 M-2 Exceptions](#27-m-2--exceptions) ·
[28 M-3 People remainder](#28-m-3--people-the-remainder) ·
[29 M-7 Config and access](#29-m-7--config-and-access-control) ·
[30 M-8 Reports](#30-m-8--reports) ·
[31 M-9 Audit](#31-m-9--audit)

**Part IV — [Sequencing](#part-iv--sequencing)**
[32 Build order](#32-build-order) ·
[33 Definition of done](#33-definition-of-done) ·
[34 Traceability](#34-traceability)

---

# Part 0 — Before you start

## 0.1 Decisions taken here

`spec.md` leaves three things genuinely open. A guide cannot, so each is
decided below. **Each is reversible and marked with what to change if the
decision goes the other way.** Raise them with the supervisor before Part II
is built.

### D-1 · Leave Deduction Ladder seeds to profile B

`spec.md` §3.10 offers two profiles and says it does not settle the choice.

**Decision: profile B**, the old workbook's four bands converted to
percentages. Reasons: it is the behaviour the company's numbers actually
encode today, so opening balances reconcile at cutover; and `BR-9` says the
deduction is the *worse* of the lateness test and the hours-clocked test,
which needs two tests to compare — profile A has only one.

*If overruled:* change the `leaveDeductionLadder` array in `scripts/seed.js`.
No code changes — the ladder is read from `teamPolicy` at calculation time
(`FR-6.4`). Profile A is expressible as a single-row ladder.

### D-2 · Recalculation is synchronous and scoped

**Decision:** a write recomputes the day records it affects inside the same
request, before responding.

Reasons: MVP criterion 18 requires a corrected punch to show its new total
*at once*; a punch edit touches at most two day records, so the work is
trivial; and one code path cannot drift from a second one, which `NFR-8`
requires. Wide fan-out (a calendar edit, a policy change, a team move) is
handled by bounding the date range and warning before saving — `S-17` already
specifies that warning.

*If overruled:* the recalculation entry point is a single function,
`recalculateDays(userId, dateRange)` (§23.3). Moving it behind a queue means
changing its callers, not its logic. Do not build both paths.

### D-3 · Build order is dependency order

§32 sequences the remaining work by what must exist before what. It is
**not** the supervisor's phase numbering, which is agreed separately. Where
the two differ, the supervisor's plan decides *when*; this decides *what
breaks if you go earlier*.

---

## 0.2 What already exists

Phase 1 is merged and verified. Build on it; do not re-derive it.

```
proxy.js            single auth/session/authorization validator (Node runtime)
auth.js             Auth.js v5 · Google · JWT · no adapter
session.js          getSessionUser() — the only place a server reads the user
database.js         every MongoDB query · 20 collections · no hard-delete path
constants/index.js  every domain enum
authz/
  check.js          resolveScope · recordInScope · validateGrants
  routes.js         isPublicPath · requiredPermissionFor
  guard.js          requireActor · assertPermission · assertRecordInScope
  signin.js         evaluateSignIn
utils/
  employment.js     deriveEmploymentDates · isWithinEmploymentPeriod
  apiResponse.js    errorResponse
components/         AppShell · PageHeader · EmptyState · ScreenStub
                    ReasonDialog · UserRoster · UserDetail · UserFormDialog
                    UserStatusChips · navigation.js
hooks/              useUserMutations.js
app/theme/          colors.js · theme.js · fonts.js
app/(app)/          22 routed, permission-gated screens
scripts/seed.js     §3.10 configuration and demo roster
```

**Built and working:** Google sign-in with five distinct rejections · the
`FR-1.2` model end to end · all 22 screens routed and gated · People roster,
detail, create, soft delete, restore, audited · `409` on stale writes ·
100 tests.

**Stubs:** 21 screens render their documented tabs, columns and filters via
`ScreenStub` and state that they are not implemented. Replacing a stub is the
unit of work in Part III.

**All 20 collections already exist.** Nothing in this guide requires a
migration.

---

## 0.3 The nine invariants

Break one of these and the app is wrong in a way tests may not catch. They are
repeated in context throughout, but this is the list to re-read before a pull
request.

| # | Invariant | From |
| - | --------- | ---- |
| **I-1** | **Nothing is destroyed.** No endpoint hard-deletes. Working records are soft deleted, ledger entries are cancelled by a reversing entry, audit records are append-only. | `DC-3`, `NFR-9` |
| **I-2** | **Balances are replayed, never stored.** No column holds a balance. Employment period is derived from tenures. The only stored derivations are date of joining and date of leaving, and both are rewritten in the same operation as any tenure change. | `DC-4`, `FR-6.8` |
| **I-3** | **Policy is data.** Every item in `FR-6.4` is read from `teamPolicy` or company config at calculation time. A number from §3.10 in a `.js` file is a defect. | `DC-1`, `FR-6.4` |
| **I-4** | **Two authorization checks, always.** `proxy.js` gates the endpoint; the handler gates the record. Neither alone is sufficient. | `FR-1.2` |
| **I-5** | **No fallback hides a gap.** A missing shift, unset config, unparseable date, unknown employee code, missing punch or untracked user raises an exception, a prompt or a stated rejection — never a default or a silent zero. | `DC-6` |
| **I-6** | **Human decisions survive recomputation.** An override is stored on the record it changes, beside the engine's value. Recalculation refreshes the engine value and leaves the override standing. | `DC-7`, `FR-6.12` |
| **I-7** | **Time resolves through the shift.** All timestamps UTC; timezone lives on the shift; no company-wide default; work date computed by the system using the shift held *on that date*. | `DC-5` |
| **I-8** | **Everything is audited.** Every create, update, soft delete, restore, approval, rejection, override and correction writes actor, action, entity, before, after, time. | `FR-9.1`, `FR-9.2` |
| **I-9** | **Recalculation is idempotent.** Running it twice, or resuming after failure, must not double-post a ledger entry or double-count a total. | `NFR-15`, `DC-9` |

---

# Part I — Layers

Read Part I once. It applies to every module in Part III, and most conflicts
between modules come from one of them re-inventing something here.

## 1 Layer map

```
   proxy.js ──────────── endpoint check, runs before everything
        │
   app/(app)/**/page.js  server component: reads session + data, passes props
        │                        │
        │                        ↓
        │                 components/*.jsx  client leaf: pure, props in,
        │                                   callbacks out
        │                        │
        │                        ↓
        │                 hooks/*.js  fetch, pending, error
        │                        │
        ↓                        ↓
   app/api/**/route.js ── record check (guard.js) → engine → database.js
                                                       │
                                                       ↓
                                                  MongoDB
```

**Dependency rules.** Arrows point one way only.

- `database.js` imports from `constants/` and `utils/`. Never from `app/`,
  `components/` or `authz/guard.js`.
- The engine (`engine/`, Part II) imports `database.js`, `constants/`,
  `utils/`. Never `app/` or `components/`.
- Components import `hooks/`, `constants/`, other components. **Never**
  `database.js`, `session.js` or the engine.
- Only server components and route handlers import `session.js`.

A component importing `database.js` will fail the build in some places and
leak your connection string into the client bundle in others. If you need data
in a component, the parent server component fetches it and passes it down.

## 2 Data access

### 2.1 Every query lives in `database.js`

No exceptions, including single-caller queries. A `page.js` or `route.js` that
calls the driver is a defect, even when it works.

Why it is worth the friction: reporting (`FR-8.3`) and ledger replay
(`BR-14`) are aggregation-heavy, and when those pipelines are scattered across
route files nobody can answer "what does this app actually ask the database
for" — which is the question you need answered when `NFR-3` fails.

### 2.2 Document conventions

Every document in every collection carries:

| Field | Type | Why |
| ----- | ---- | --- |
| `companyId` | string | `DC-12` multi-tenancy from day one. `DEFAULT_COMPANY_ID` until a switcher ships. |
| `deletedAt` | `Date \| null` | `I-1`. Working records only; ledger and audit never have it set. |
| `version` | int | `I-6`/`NFR-14` optimistic concurrency. Starts at 1. |
| `createdAt` / `createdBy` | `Date` / userId | Audit trail redundancy. |
| `updatedAt` / `updatedBy` | `Date` / userId | Same. |

Ledger entries and audit records are exempt from `deletedAt` and `version` —
they are never updated.

### 2.3 Adding a collection

1. Add the name to `COLLECTIONS` in `database.js`.
2. Add a Zod schema for its writes, next to the existing ones.
3. Add its indexes to `ensureIndexes()`. Every index starts with `companyId`.
4. Export query functions. Never export the collection handle.

### 2.4 Paging

`NFR-3` and `DC-10`: any full-company view pages or virtualises. Never
`.find()` without a `.limit()` on a collection that grows with the roster.

The existing `listUsers` is the pattern — filter, sort, skip, limit, plus a
`countDocuments` for the total, run concurrently. Offset paging is fine at the
`NFR-5` ceiling of 1000 users and does not need replacing with cursors.

**Sort must be deterministic.** A sort on a non-unique field alone (`fullName`,
`date`) can repeat or skip rows across pages. Add `_id` as the final sort key
on every paged query.

## 3 Authorization

### 3.1 The two checks

| Check | Where | Question | Failure |
| ----- | ----- | -------- | ------- |
| Endpoint | `proxy.js` via `requiredPermissionFor` + `resolveScope` | May this role do this at all? | Redirect `/403`, naming the permission |
| Record | Handler via `assertPermission` + `assertRecordInScope` | Does that scope reach *this* record? | `404`, never `403` |

The record check answers `404` deliberately. `403` on an out-of-scope record
confirms it exists to someone not permitted to know that.

### 3.2 Adding a permission

1. Add it to `PERMISSIONS` in `constants/index.js`.
2. Add a route rule in `authz/routes.js` — **above** any dynamic pattern that
   would swallow it.
3. Seed grants for the roles that should hold it in `scripts/seed.js`.
4. `OFFICE_ADMIN` needs nothing: `resolveScope` returns `ALL` for it before
   consulting grant data, so a new permission never locks the all-permission
   role out of the screen used to grant it (`FR-1.3`).

### 3.3 Gating a handler

`proxy.js` gates on the *path*, which cannot distinguish `GET` from `POST` on
the same route. Every handler asserts the permission its **method** needs:

```js
const actor = await requireActor();
const scope = assertPermission(actor, PERMISSIONS.ATTENDANCE_WRITE);
const record = await getDayRecord(id);
if (!record) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
assertRecordInScope(scope, actor, { userId: record.userId, teamId: record.teamId });
```

`assertRecordInScope` takes a normalised `{ userId, teamId }`, not a raw
document, so it does not care how each collection names its fields.

### 3.4 Gating UI

Client components never read the session. They receive `user.permissions` —
the resolved permission-to-scope map from `getSessionUser()` — and branch on
that:

```js
{canWrite ? <Button …/> : null}      // canWrite = Boolean(user.permissions[PERMISSIONS.X])
```

Never `user.role === 'OFFICE_ADMIN'`. That hardcodes into the UI exactly what
`FR-1.2` stores as editable data, and it silently diverges from `S-19` the
moment a grant moves.

### 3.5 Never cache grants

`getPermissionGrants()` reads per request and caches nothing in module scope.
This is what makes an `S-19` edit effective on the next request. A cache here
breaks `FR-1.2` and MVP criteria 4 and 7, and it will look like it works.

## 4 Audit

### 4.1 What to write

`FR-9.1`: every create, update, soft delete, restore, approval, rejection,
override and correction, on every entity. Plus every authentication event
(`FR-1.6`), which `recordSignInAttempt` already handles.

```js
await writeAuditRecord({
  actorId: actor.userId,
  actorName: actor.name,
  action: 'DAY_STATUS_OVERRIDDEN',   // verb, past tense, SCREAMING_SNAKE
  entityType: 'dayRecord',
  entityId: id,
  before,                             // the whole document before
  after,                              // the whole document after
  reason,                             // mandatory on overrides and corrections
});
```

`before` and `after` are full documents, not diffs. `P-44` and `P-45` show
them side by side, and a diff computed at write time cannot answer a question
nobody had thought of yet.

### 4.2 Audit is append-only

There is no update or delete function for `auditRecords` in `database.js` and
none may be added. `FR-9.3` makes this absolute.

### 4.3 Write it in the same operation

An audit record written in a later request, or skipped when a write fails
halfway, produces a history nobody can trust. Write it immediately after the
mutation, in the same handler, before responding.

## 5 Soft delete and the three record classes

`NFR-9` defines three classes that behave differently. Getting these confused
is the single easiest way to corrupt the data model.

| Class | Members | Edit | Remove |
| ----- | ------- | ---- | ------ |
| **Working** | users, tenures, punches, day records, teams, shifts, calendars, configuration | In place | `deletedAt = now` |
| **Ledger** | `ledgerEntries` | **Never** | **Never.** Append a reversing entry. |
| **Audit** | `auditRecords` | **Never** | **Never.** |

### 5.1 Soft delete does two different jobs

`spec.md` §3.2 is emphatic and it is easy to conflate them:

- Soft deleting **a user** hides nothing. They stay in every list, report and
  statistic their reader may see, marked *no longer active*. It only says they
  no longer work here.
- Soft deleting **records stranded outside a reduced employment period**
  (`FR-2.11`) *does* hide them, on purpose, because the person was not there
  on those days.

### 5.2 Excluding soft-deleted records

Every query that feeds a total must exclude `deletedAt != null` records. Every
query that feeds a *list of people* must include them, marked. When in doubt:
**totals exclude, rosters include.**

## 6 Concurrency

`NFR-14`: two `OFFICE_ADMIN` users on the same period is the normal case, not
an edge case.

### 6.1 The pattern

Already implemented as `updateWithVersion` in `database.js`. The version the
caller loaded is part of the filter:

```js
findOneAndUpdate(
  { _id, companyId, version },        // version from the client
  { $set: {…}, $inc: { version: 1 } },
)
```

No match means someone else wrote first. Throw `StaleWriteError` carrying the
current document; `errorResponse` maps it to `409` with `current` in the body;
`useUserMutations` surfaces it as `conflict`; the screen shows `P-47`.

### 6.2 Rules

- Every mutation endpoint takes `version` in its body. No exceptions.
- Every screen that can mutate holds the version it loaded.
- `P-47` must show the current state, not just an error. Two administrators
  need to see what the other did to reconcile.
- Ledger appends need no version — they never update anything.

## 7 Time

`DC-5`, and the source of the workbook's defect F6.

### 7.1 Rules

1. **Store UTC.** Every instant in the database is UTC.
2. **The timezone lives on the shift.** There is no company-wide default and
   none may be added. `S-18` says so on the screen.
3. **Resolve through the shift held on that date**, not the user's current
   shift. A user who changed shifts in June must have May computed under the
   old one.
4. **Never `new Date()` for parsing or arithmetic.** `date-fns` and
   `date-fns-tz`, per `CLAUDE.md`.
5. A display default may exist for a screen with no shift in context and
   **must never enter a calculation**.

### 7.2 Dates versus instants

Two distinct types, never interchange them:

| | Type | Stored as | Example |
| - | ---- | --------- | ------- |
| **Calendar date** | local civil date | `'YYYY-MM-DD'` string | `dateOfJoining`, `workDate`, `dayRecord.date` |
| **Instant** | a point in time | `Date` (UTC) | `punch.at`, `deletedAt`, `auditRecord.at` |

A calendar date is a string on purpose. Storing "3 August" as a `Date` makes
it 3 August *somewhere*, and the answer changes with the reader's timezone.
`utils/employment.js` already follows this.

### 7.3 Daylight saving

`FR-3.11`. Resolve a shift's start and end to absolute instants using that
shift's timezone and the **offset in force on that work date**:

- A transition day is 23 or 25 hours, not 24. Never add 24 hours to get
  tomorrow.
- **Spring forward:** a local time that does not exist is *rejected as
  invalid* (`I-5`), not quietly shifted.
- **Fall back:** a local time that happens twice is taken as **the first**.

Use `fromZonedTime` / `toZonedTime` from `date-fns-tz` and let it do the
offset lookup. Do not store or compute offsets yourself.

## 8 Policy as data

`DC-1` and `I-3`. Every item in the `FR-6.4` list is read at calculation time.

### 8.1 Where it lives

| Scope | Collection | Holds |
| ----- | ---------- | ----- |
| Company | `authorisedDomains` | Workspace domains for sign-in |
| Company | `employmentTypes` | `PERMANENT`, `CONTRACT`, … |
| Company | `permissionGrants` | role × permission × scope |
| Team | `teamPolicy` | leave types, entitlement, accrual, all three ladders, PTO validity, WFH quota, thresholds, windows |
| Team | `shifts` | start, end, required duration, grace, **timezone** |
| Team | `holidays` | typed calendar entries |
| Team | `weeklyOffPatterns` | non-working days |

### 8.2 Reading it

Every engine function takes policy as an **argument**. It never fetches its
own. This keeps the engine pure and testable, and makes it obvious at the call
site which policy version a calculation used.

```js
// good
computeDeduction({ latenessPercent, clockedPercent, ladder })

// wrong — hidden dependency, untestable without a database
computeDeduction({ userId, date })
```

### 8.3 Missing configuration

`FR-3.13` and `I-5`. A required value that is not set does **not** get a
default. It raises an exception onto `S-05`, naming the entity and the
outstanding field, and stays queued until set. The day record is still created
but carries no status (`FR-3.12`).

## 9 API contracts

### 9.1 Status codes

One meaning each, mapped centrally in `utils/apiResponse.js`. Do not invent
per-route statuses.

| Code | Meaning |
| ---- | ------- |
| `200` | Read or update succeeded |
| `201` | Created |
| `400` | Validation failed — body carries the specific message |
| `401` | Not signed in |
| `403` | Signed in, permission not held — body names the permission |
| `404` | Not found, **or** outside the viewer's scope |
| `409` | Stale write — body carries `current` |

### 9.2 Shapes

- **List:** `{ items, total, page, pageSize }`, plus any counts the screen
  states (`listUsers` adds `activeCount`).
- **Single:** the document.
- **Error:** `{ error: string }`, plus `permission` on 403 and `current` on 409.

### 9.3 Contract tests come first

`CLAUDE.md`: write the contract test before the route, and assert the same
contract **from both sides** — the handler fulfils it and the client hook
consumes it. A contract change is not done until both are updated in the same
change.

### 9.4 Mutations

Every mutation endpoint:

1. `requireActor()`
2. `assertPermission(actor, <the permission this METHOD needs>)`
3. Load the record; `404` if absent
4. `assertRecordInScope(scope, actor, …)`
5. Validate the body with Zod
6. Mutate with `version`
7. **Recalculate affected days** (§23.3)
8. `writeAuditRecord(…)`
9. Respond

Steps 7 and 8 are the ones that get forgotten. If a mutation can change a
number a user sees, it recalculates. If it changes anything at all, it audits.

## 10 UI conventions

### 10.1 Server/client boundary

- Server components read the session and the data, and pass plain props down.
- **Serialise before crossing.** `ObjectId` and `Date` do not cross. Convert
  to `String(_id)` and `.toISOString()`. The existing `users/page.js` and
  `users/[id]/page.js` show the pattern.
- **Never pass a function into a client component** from a server component.
  `component={Link}` on an MUI component fails the build; use `href`.

### 10.2 Components are pure

Data in via props, actions out via callbacks. No fetching, no validation, no
business logic. That work goes in `hooks/` (client) or the engine (server).
Shared state lifts to the nearest common parent. **The React Context API is
not allowed** (`CLAUDE.md`).

### 10.3 Forms and dialogs

A real `<form onSubmit>` with `event.preventDefault()`, `type='submit'` on the
primary button and `type='button'` on every other one. Enter submits, Esc
cancels — neither depends on a handler being wired right. `ReasonDialog` and
`UserFormDialog` are the reference implementations.

### 10.4 States

Every screen defines three, and `list-of-screens.md` states them per screen:

- **Empty** — says *why* it is empty and what to do. Never a blank grid, never
  zeroes that read as "absent all year". Use `EmptyState`.
- **Loading** — skeletons matching the eventual layout.
- **Error** — scoped as tightly as possible. `S-04` fails per tile so one
  broken count does not blank the page.

### 10.5 Accessibility and clarity

`NFR-2`, `NFR-12`, `DC-11`:

- Status is **never colour alone** — icon plus text label, via the theme's
  `statusX` chip variants. Never an `sx` severity map.
- No unexplained abbreviation. `PageHeader`'s `description` is where the
  counting rule gets stated.
- Keyboard first. The focus ring in `theme.js` is not decorative.
- Relative timestamps carry the absolute value in `title`.

### 10.6 MUI v9

Per `CLAUDE.md`: `sx` for layout, `slotProps.<slot>` not `InputLabelProps`,
Grid `size` not `xs/sm/md`, Stack/Grid as containers not Box. On a labelled
select with a `<MenuItem value=''>`, always
`slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}`.

Verify any icon name exists in `@mui/icons-material` before importing it.

## 11 Testing

### 11.1 TDD is required

`CLAUDE.md`: invoke `/test-driven-development` before writing implementation.
Write the test, **watch it fail for the right reason**, then implement.

### 11.2 What to test where

| Unit | Test | Environment |
| ---- | ---- | ----------- |
| Engine functions | Exhaustively — they are pure and take policy as an argument | node |
| `database.js` | Valid input, invalid input → specific error, driver failure handled, one edge case. Mock the driver. | node |
| API routes | Request and response contract, both sides | node |
| Components | State, variant, role, visibility, enabled/disabled | jsdom |
| Design tokens | `app/__tests__/theme.test.js` **only** | node |

### 11.3 Two failure smells

1. A design-token change breaks an app test → the assertion was in the wrong
   place. Move it to `theme.test.js` and assert behaviour instead.
2. A behaviour-preserving refactor breaks a test → the test is brittle. Fix or
   delete it.

Never test SDK internals, framework wiring, private methods, call order, or
runtime-owned configuration.

### 11.4 The engine deserves worked examples

Every worked example in Part II is written to become a test case. Use them.
They encode the cases most likely to be got subtly wrong, and a wrong
implementation fails them loudly rather than producing a plausible number.

---

# Part II — The engine

This is the part most likely to be built subtly wrong: it will produce
plausible numbers while being incorrect. Every section below gives the
algorithm and at least one worked example to turn into a test.

**All engine code lives in `engine/`, imports nothing from `app/` or
`components/`, and takes policy as an argument** (§8.2). It is pure wherever
it can be: the only functions that touch the database are the orchestrators in
§23.3.

```
engine/
  workDate.js       resolveWorkDate
  duration.js       pairPunches · workedMinutes
  classify.js       resolveDayType · resolveDayStatus
  punctuality.js    lateMinutes · earlyMinutes · isCompliant · isShortDay
  ladders.js        deductionFor · proposePtoAward · proposeCtoApplication
  ledger.js         entryFor · replayBalance · reverse
  accrual.js        entitlementFor · prorate · lapseOnDeparture
  recalculate.js    recalculateDays  ← the only stateful entry point
```

## 12 Engine overview

Two entities, one derived from the other. This mirrors the ledger/balance
relationship exactly.

```
  PUNCH  (the fact)                    DAY RECORD  (the conclusion)
  one check-in or check-out            one per tracked user per date
  an instant, in UTC                   within their employment period
  editable — the unit of correction    recomputed, never hand-built
         │                                        │
         └──────── work date links them ──────────┘
                                                  │
                                                  ↓
                                          LEDGER ENTRIES
                                          immutable movements
                                          balances replay from these
```

**The pipeline, for one user on one date:**

```
1. resolve the team and shift held ON THAT DATE      (not their current ones)
2. resolve each punch's work date                     §13
3. pair punches → worked minutes                      §14
4. resolve day type   (calendar + weekly off)         §15
5. resolve day status (override → leave → punches)    §16
6. compute lateness, early departure, short day       §17
7. compute deduction from the ladder                  §18
8. post ledger entries for any movement               §19
9. propose PTO / CTO candidates — post nothing        §21, §22
```

Steps 1–7 are pure. Step 8 writes. Step 9 only enqueues suggestions onto
`S-05`.

### 12.1 The day record shape

The override design is the whole of `DC-7`. Engine values and human values sit
side by side and never overwrite one another.

```js
{
  companyId, userId,
  date: '2026-08-12',           // calendar date string, §7.2

  teamId, shiftId,              // as held ON THIS DATE — frozen at compute time

  dayType: 'WORKING',           // §15 — no override; it is a fact about the date

  computed: {                   // rewritten on every recalculation
    dayStatus: 'WFO',
    workedMinutes: 402,
    lateMinutes: 120,
    earlyMinutes: 0,
    deduction: 0.25,
    deductionRule: 'BR-9:profileB:band1',
    isShortDay: true,
  },

  override: {                   // written only by OFFICE_ADMIN; never by the engine
    dayStatus: 'WFH',           // any subset of the computed fields
    actorId, actorName,
    reason: 'Approved WFH, home internet outage',
    at: Date,
  } | null,

  exceptions: ['MISSING_CHECK_OUT'],   // §27 — drives S-05

  version, deletedAt, createdAt, updatedAt,
}
```

**The effective value of any field is `override[field] ?? computed[field]`.**
Write that as one helper and use it everywhere — reports, screens and the
ledger must all agree.

```js
export const effective = (dayRecord, field) =>
  dayRecord.override?.[field] ?? dayRecord.computed[field];
```

There is **no separate override collection** (`FR-6.11`).

## 13 Work date resolution

`FR-5.8`. Every punch belongs to exactly one work date: **the local date on
which that user's shift started**, in the shift's own timezone and DST offset.

Always computed by the system, never typed. Recomputed whenever the punch or
the shift assignment changes.

### 13.1 The chicken and egg

To find the shift you need the work date; to find the work date you need the
shift. Resolve it by search, not by assumption — and never by falling back to
a default timezone (`I-5`, `DC-5`).

```
resolveWorkDate(punchInstant, shiftAssignments):

  1. candidates = assignments whose effective range overlaps
                  [punchInstant − 48h, punchInstant + 48h]
  2. if candidates is empty
       → no shift on this date. Raise FR-3.12.
         Create the day record with NO status. Keep the punch's recorded time.
         Assign a work date once a shift is known. Do not guess.

  3. for each candidate shift S:
       for each candidate date D in {localDate(punchInstant, S.timezone),
                                     that date − 1 day}:
         window = absolute instants of S on D           (§13.2)
         widened = [window.start − S.crossingWindow,
                    window.end   + S.crossingWindow]
         if punchInstant ∈ widened → return D

  4. no window matched → raise an exception for OFFICE_ADMIN.
     A punch far outside any shift window is a data error, not a day to invent.
```

The 48-hour candidate span is generous on purpose: it costs one small indexed
query and covers a crossing shift plus its window on either side.

**If two candidate shifts both match** — possible only on the day an
assignment changes — prefer the assignment that covers the *resolved* work
date, then recompute once. Converges immediately; it cannot loop, because the
second pass has a fixed date.

### 13.2 Resolving a shift window to instants

```
shiftWindow(shift, workDate):
  startLocal = workDate + shift.startTime                    // '2026-03-09 19:00'
  endLocal   = shift.crossesMidnight
                 ? (workDate + 1 day) + shift.endTime        // '2026-03-10 04:00'
                 : workDate + shift.endTime

  return {
    start: fromZonedTime(startLocal, shift.timezone),        // date-fns-tz
    end:   fromZonedTime(endLocal,   shift.timezone),
  }
```

`shift.crossesMidnight` is derived, not stored: `endTime <= startTime`.

**Never compute `end` as `start + requiredDailyMinutes`.** On a DST transition
day the window is 23 or 25 hours (`FR-3.11`), and `fromZonedTime` on both ends
gets that right for free.

### 13.3 DST edge cases

| Case | Rule | Why |
| ---- | ---- | --- |
| Spring forward — local time does not exist | **Reject the punch as invalid**, stating that as the reason | `FR-3.11`, `I-5`. Shifting it silently invents a time the person could not have punched. |
| Fall back — local time happens twice | Take **the first** occurrence | `FR-3.11`. Stated so both readings do not float. |

### 13.4 Worked example — night shift across midnight

**Defect F6 in the old workbook, and MVP criterion 12.**

GC team. Shift `19:00 → 04:00`, `Asia/Karachi`, required 540 min, crossing
window 8 h.

| Punch (local) | Reasoning | Work date |
| ------------- | --------- | --------- |
| `2026-03-09 19:05` in | Inside the window starting 2026-03-09 | **2026-03-09** |
| `2026-03-10 02:30` out | After midnight but before the 04:00 end of the window that *started* on the 9th | **2026-03-09** |
| `2026-03-10 19:30` in | Inside the window starting 2026-03-10 | **2026-03-10** |

The night worked 19:05 → 02:30 is **one day, not two**. The workbook split it
and that is defect F6.

Test to write: assert all three work dates, then assert the day record for
2026-03-09 has `workedMinutes = 445` and exactly one record exists for that
date.

## 14 Worked duration

`FR-3.5`. The sum of all check-in → check-out intervals on that work date.
`FR-4.6`: more than one pair a day is normal and they aggregate into one
total.

### 14.1 Pairing

```
pairPunches(punchesOnWorkDate):
  live   = punches where !deletedAt and !isDuplicate      // FR-4.7
  sorted = live sorted by instant ascending

  pairs = [], open = null, exceptions = []
  for p in sorted:
    if p.type == CHECK_IN:
       if open != null → exceptions.push(MISSING_CHECK_OUT)   // discard nothing
       open = p
    else:                                    // CHECK_OUT
       if open == null → exceptions.push(MISSING_CHECK_IN)
       else { pairs.push([open, p]); open = null }

  if open != null → exceptions.push(MISSING_CHECK_OUT)
  return { pairs, exceptions }

workedMinutes = Σ (out − in) over pairs
```

### 14.2 Rules that are easy to miss

- **A missing punch is never zero hours** (`FR-4.8`, `I-5`). It raises an
  exception onto `S-05` and the day keeps whatever *complete* pairs it has.
- **Duplicates are excluded from pairing, not deleted** (`FR-4.7`). Two
  punches of the same type, same user, same work date, inside the team's
  duplicate window are flagged. `P-07` lets `OFFICE_ADMIN` keep or soft delete.
- **An impossible duration is an exception, not a number**: total > 24 h, or a
  check-out earlier than the check-in it closes. Both queue on `S-05`
  (`FR-8.6`).
- Duration is computed from **instants**, so a crossing shift needs no special
  case here. §13 already did that work.

### 14.3 Worked example — two pairs on one day

Shift `09:00 → 18:00`, required 540.

```
in  09:02   out 13:00     →  238 min
in  13:45   out 18:04     →  259 min
                             ───────
                             497 min   (8 h 17 m)
```

One day record, `workedMinutes = 497`. 497 / 540 = 92.0%, which is above the
89% short-day threshold (`BR-5`), so **not** a short day.

## 15 Day type

`FR-5.9` step one, and it comes first because the status rules branch on it.

```
resolveDayType(date, team, holidays, weeklyOffPattern):
  if holidays has an entry for (team, date) and not deletedAt → HOLIDAY
  if weeklyOffPattern.daysOfWeek includes dayOfWeek(date)     → WEEKLY_OFF
  otherwise                                                    → WORKING
```

**Use the team the user held on that date**, from `teamAssignments`, not their
current team (`FR-3.14`). This is what makes MVP criterion 19 work: an August
report counts Team A's holidays for someone who moved to Team B in September.

**Day type is a fact about the date, not about the person.** It has no
override. `OFFICE_ADMIN` changing what happened on a day overrides the
*status*; changing whether a date is a holiday is a calendar edit, which is
audited and triggers recalculation of that date (`BR-15`).

> **Decision.** `spec.md` does not say what happens when a date is *both* a
> holiday and a weekly off. **`HOLIDAY` wins**, because it is explicitly
> entered for that team while a weekly off is a standing pattern. It affects
> only reporting labels — both are non-working, so `FR-5.9` treats them
> identically for status. Change `resolveDayType`'s order to reverse it.

## 16 Day status

`FR-5.9`. **A fixed order, the same for every team, not configurable.**

```
resolveDayStatus({ dayType, override, authorisedLeave, punches }):

  1. if override?.dayStatus       → return it                  // OFFICE_ADMIN first
  2. if authorisedLeave           → return LEAVE
  3. if dayType != WORKING:
       return punches.length > 0 ? HOLIDAY_WORK
                                 : (dayType == HOLIDAY ? HOLIDAY : WEEKLY_OFF)
  4. return punches.length > 0 ? WFO : ABSENT
```

### 16.1 The traps

- **Any punches at all on a non-working day make it `HOLIDAY_WORK`**, however
  little was clocked. The `BR-27` threshold does **not** decide the status; it
  decides only whether the day is *counted* in the `FR-5.6` report (§17.4).
  Getting this backwards is the most likely error in this section.
- **`HOLIDAY_WORK` covers work on any non-working day** — the `dayType` says
  which kind it was. The workbook's `CWFO` and `CWFH` both collapse into it
  and are not carried forward.
- **`WFH` is a working-day status and the engine never infers it** (`FR-5.4`).
  It arrives only as an override. Work on a *non-working* day is
  `HOLIDAY_WORK` wherever it was performed, and where it was performed is not
  recorded.
- **A `WFH` day debits the WFH balance** (`FR-5.5`) whether the status came
  from a decision or an override.
- **Half a day of leave is `LEAVE`** with a half-day amount on the ledger, not
  a status of its own (`FR-5.2`).
- An untracked user gets **no day record at all** (`FR-2.10`), so this function
  is never called for them.
- A date in a **tenure gap** gets no day record either (`FR-2.12`).

### 16.2 Worked example — the classification order

Employee on a `WORKING` day, punched in at 09:02, and `OFFICE_ADMIN` later
recorded approved sick leave for that date.

Step 1: no status override. Step 2: authorised leave exists → **`LEAVE`**.

The punches are *not* discarded — `workedMinutes` is still computed and still
visible on `S-12`. The status is `LEAVE` because leave outranks punches in the
fixed order. A reader can see both, which is the point of storing day type and
day status separately.

## 17 Lateness and short days

`FR-5.3`. Computed from that day's punches and **that user's shift on that
date**.

```
lateMinutes  = max(0, firstCheckIn − shiftWindow.start)
earlyMinutes = max(0, shiftWindow.end − lastCheckOut)
isCompliant  = lateMinutes <= shift.graceMinutes                    // BR-6
isShortDay   = workedMinutes < shift.requiredDailyMinutes
                             × policy.shortDayThresholdPercent / 100 // BR-5
```

### 17.1 Grace decides compliance, not the figure

`BR-7` seeds grace at 30 minutes, **held on the shift**, so it is per team.
Pulse computes it against the user's own shift — the workbook hardcoded
`<= 10:30`, which was simply wrong for the 09:00 shift.

`lateMinutes` is the raw figure from shift start. Grace decides whether the
day is *compliant*; it is not subtracted from the number.

### 17.2 The percentage denominator

> **Decision.** `spec.md` expresses lateness bands as "a percentage of the
> scheduled shift" and `BR-5` as a percentage "of the required daily
> duration". **Both use `shift.requiredDailyMinutes` as the denominator.**
> They are identical on every seeded shift (a 9-hour window with 540 required
> minutes), and one denominator cannot drift from the other. Change it in
> `punctuality.js` if a team ever defines a window longer than its required
> duration and wants lateness measured against the window.

```
latenessPercent = lateMinutes    / shift.requiredDailyMinutes × 100
clockedPercent  = workedMinutes  / shift.requiredDailyMinutes × 100
```

### 17.3 Override

`BR-8`: `OFFICE_ADMIN` may override a late arrival, which then counts as
compliant and **waives the deduction**. An `OFFICE_ADMIN` action under
`FR-6.10`, never a manager one — `MANAGER` has no authority over late arrivals
(`spec.md` §2.2).

### 17.4 Holiday-work counting

`BR-27` and `FR-5.6`: a day counts as worked on a holiday when the user
clocked **more than** `policy.holidayWorkThresholdPercent` (seeded 22%) of the
scheduled shift on a non-working day.

A `HOLIDAY_WORK` day below that threshold is **still shown with its duration**
but is **not counted**. Status and counting are separate questions (§16.1).

## 18 The Leave Deduction Ladder

`FR-6.3` and `BR-9`. **Per-team configuration**, read from
`teamPolicy.leaveDeductionLadder` — never a constant (`I-3`).

The engine raises the deduction with **no leave type stated**, so it posts to
`teamPolicy.automaticDeductionLeaveType` (seeded `Casual`, `BR-26`).

### 18.1 Worse of two bands

```
deductionFor({ latenessPercent, clockedPercent, attended, ladder }):
  if !attended → return the ladder's did-not-attend row        // 1 day

  byLateness = highest deduction whose lateness band contains latenessPercent
  byClocked  = highest deduction whose clocked band contains clockedPercent
  return max(byLateness ?? 0, byClocked ?? 0)                  // BR-9
```

`BR-9` says the deduction is the **worst applicable band of either test**.
Both are evaluated; the larger wins.

### 18.2 Seeded profile B

Bands are percentages, not hours. Absolute hour bands only made sense for a
9-hour day and broke silently for any other shift length.

| Lateness % | Clocked % | Deduction | On a 9 h shift |
| ---------- | --------- | --------- | -------------- |
| > 10 to 40 | 55 to < 80 | 0.25 | late 1–3.5 h, or clocked 5–7 h |
| > 40 to 55 | 33 to < 55 | 0.5 | late 3.5–5 h, or clocked 3–5 h |
| > 55 | < 33 | 0.75 | late > 5 h, or clocked < 3 h |
| did not attend | 0 | 1 | zero hours |

`BR-11`: a full day of `LEAVE` deducts 1 day of the type stated on it — that
is the leave itself, not this ladder.

### 18.3 Worked example A — lateness and hours agree

9 h shift (540 min), grace 30, `09:00 → 18:00`.
Check in **11:00**, check out **17:00**.

```
lateMinutes     = 120                    → 120/540 = 22.2%
compliant       = 120 <= 30 → false
workedMinutes   = 360                    → 360/540 = 66.7%
byLateness      = 22.2% ∈ (10, 40]       → 0.25
byClocked       = 66.7% ∈ [55, 80)       → 0.25
deduction       = max(0.25, 0.25)        = 0.25 day, posted to Casual
isShortDay      = 360 < 540×0.89 = 480.6 → true
```

### 18.4 Worked example B — why profile A is not enough

Same shift. Check in **09:20**, check out **11:20**.

```
lateMinutes     = 20                     → 3.7%
compliant       = 20 <= 30 → TRUE        (arrived within grace)
workedMinutes   = 120                    → 22.2%
byLateness      = 3.7% matches no band   → 0
byClocked       = 22.2% < 33             → 0.75
deduction       = max(0, 0.75)           = 0.75 day
```

**Arrived on time, worked two hours, loses three quarters of a day.** Profile
A, which has only a lateness test, would deduct nothing here. This is the case
that justifies decision **D-1** — make it a test.

### 18.5 Worked example C — a shift that is not 9 hours

Support team, 6 h shift (360 min required), `10:00 → 16:00`.
Check in **11:30**, check out **16:00**.

```
lateMinutes   = 90     → 90/360  = 25%    ∈ (10, 40]  → 0.25
workedMinutes = 270    → 270/360 = 75%    ∈ [55, 80)  → 0.25
deduction     = 0.25
```

The same percentages apply unchanged to a shorter shift. Hardcoding "late more
than 1 hour" would have deducted the same 0.25 for a proportionally *worse*
lateness. This is why the bands are percentages.

## 19 The ledger

`FR-6.8` and `I-2`. **A balance is never stored.** It is replayed by summing
entries, and a movement is cancelled by appending its reverse — never by
editing or deleting the original.

### 19.1 Entry shape

```js
{
  companyId, userId,
  date: '2026-08-12',            // the date the movement is ABOUT
  entryType: LEDGER_ENTRY_TYPE.AUTOMATIC_DEDUCTION,
  leaveType: 'Casual',           // null for PTO entries
  amount: -0.25,                 // SIGNED: credits +, debits −

  rule: 'BR-9:profileB:band1',   // or MANUAL_GRANT — FR-7.6
  sourceType: 'dayRecord',       // what caused it
  sourceId: '<dayRecord _id>',

  reversalOf: null,              // set on a reversing entry

  actorId, actorName, reason,    // reason mandatory on manual and reversing
  createdAt: Date,
}
```

**Signed amounts.** Replay is a sum, with no per-type sign table to get wrong.

### 19.2 Replay

```
replayBalance(userId, leaveType, asOfDate):
  Σ amount  where userId, leaveType, date <= asOfDate
```

`BR-14` in ledger terms:

```
leave balance   = opening + credited − availed − automatic deductions
                          + CTO applied against those deductions
PTO balance     = approved awards − PTO taken as leave − CTO applications
                          − expiries
```

Both fall out of the same sum, because each term is an entry with the right
sign. **Do not implement two formulas.**

### 19.3 Idempotency — the mechanism that makes `I-9` true

Every entry carries `(sourceType, sourceId, entryType)`. Put a **unique
partial index** on `(companyId, userId, sourceType, sourceId, entryType)` for
non-reversal entries.

Re-running a recalculation therefore *cannot* double-post: the second insert
violates the index and is ignored. This is what makes `NFR-15` structural
rather than a promise about how carefully the code was written.

Reversals are exempt — a movement may legitimately be reversed and re-applied.

### 19.4 Reversing

```
reverse(entry, actor, reason):
  append {
    ...entry,
    amount:     −entry.amount,
    entryType:  REVERSAL,
    reversalOf: entry._id,
    actorId, actorName, reason,
  }
```

The original is untouched. `S-14` shows both, with the reversal marked, which
is how `NFR-11` — "why is this number what it is" — stays answerable.

### 19.5 Worked example — MVP criterion 16

Soft deleted 9 August, date of leaving 4 August. Records exist for 5–8 August
which were counted as absences and consumed leave.

```
1. Soft delete → access revoked immediately, tenure closed at 2026-08-04
2. FR-2.11 check finds 4 day records outside the reduced period
3. Approval raised on S-05, naming the user, the change, the dates, the records
4. OFFICE_ADMIN approves:
     - the 4 day records get deletedAt        → leave every total
     - each ledger entry they caused is REVERSED, not edited
       e.g. AUTOMATIC_DEDUCTION −1.00 Casual  → REVERSAL +1.00 Casual
5. Balance replays 1.00 day higher. No entry was destroyed.
6. Restore later → reverse the reversals. Balance returns exactly.
```

A July report is untouched throughout, with the user marked *no longer
active*.

## 20 Accrual, carry forward and lapse

`FR-6.6`, `BR-12`, `BR-13`. Accrual period is **per team**, seeded to the
leave year, which is the calendar year.

### 20.1 Crediting

The whole annual entitlement is credited at the **start of the leave year**
as an `ENTITLEMENT_CREDIT` entry per leave type — 10 Annual, 10 Sick, 10
Casual at seed (`BR-12`).

Where a team accrues over a shorter period, the per-period figure is **derived
at calculation time** from that team's annual entitlement and accrual period,
never stored as a constant — so changing the entitlement changes the accrual
with no code change (`BR-13`).

The workbook's single pooled balance accruing `+1.67`/month is **not adopted**.
Pulse holds the typed balances of `BR-12`.

### 20.2 Proration

`FR-2.7`. A joiner is prorated from their date of joining; a second or later
tenure prorates from **that tenure's start**, not the original joining date.

```
prorate(annualEntitlement, tenureStart, leaveYearEnd):
  remaining = days from max(tenureStart, leaveYearStart) to leaveYearEnd
  total     = days in the leave year
  return round(annualEntitlement × remaining / total)
```

> **Decision.** `spec.md` does not state the rounding. **Round to the nearest
> 0.5 day**, because leave is transacted in half days (`BR-11`, and half-day
> leave in `FR-5.2`). A figure like 6.37 days is not spendable. `OFFICE_ADMIN`
> may override the prorated figure via `P-20` (`FR-2.7`, `FR-6.10`).

### 20.3 Lapse on departure

Carry forward applies **within one tenure only**. When a tenure ends, post a
`LAPSED_ON_DEPARTURE` entry bringing each balance to zero on the end date.

This is what lets every balance stay a plain sum with no special case for a
re-hired user. If the tenure is reopened as a **correction**, reverse the
lapse entry and the old balance returns (`FR-2.3`).

### 20.4 Opening balances at cutover

`FR-6.13`. At go-live, `OFFICE_ADMIN` enters each opening balance **by hand**
from the old workbook via `P-19`. The system does not compute it — historical
attendance is deliberately not migrated, only the roster (`FR-2.9`).

Each posts as an `OPENING_BALANCE` entry dated at cutover, carrying actor,
timestamp and a mandatory reason, so every balance thereafter is still a
replay. A user created after cutover has **no** opening entry, and `S-14` says
so rather than showing a zero row.

## 21 PTO

`FR-7.1`–`FR-7.4`. One earned balance, two ways to spend it. **PTO is credited
only by an approved award for work beyond scheduled hours.**

### 21.1 Propose, never post

The system detects a candidate day, names the rule and proposes an amount. It
**posts nothing** (`FR-7.1`). The candidate queues on `S-05` and appears on
`S-15`.

`OFFICE_ADMIN`'s decision is unconstrained (`FR-7.2`): approve as proposed,
approve a different amount — including one no ladder row produces — decline,
or originate an award the system never suggested (`FR-7.7`, `P-04`).

**The ladder decides what is proposed. It never limits what may be approved.**

### 21.2 Seeded award ladder

| Rule | Condition | Proposes |
| ---- | --------- | -------- |
| `BR-18` | Half an extra working day | 0.5 |
| `BR-19` | One full extra working day | 1 |
| `BR-20` | A full night worked, then the next working day as well | 2 |

`BR-21`: teams that routinely work beyond scheduled hours — night support and
Product Owners — take PTO in return for those hours.

### 21.3 Expiry

`FR-7.3`. PTO expires `teamPolicy.ptoValidityDays` (seeded 30) after **the
date the extra work was performed** — earned 5 August, expires 5 September.

**If approval happens after the expiry date has passed**, the award posts with
its expiry extended to 30 days from the **approval** date, and the extension
is visible on the award. `OFFICE_ADMIN` may override an expiry (`P-27`).

Expiry posts a `PTO_EXPIRY` debit on the expiry date. Because it is a ledger
entry, a balance "as of" any past date remains correct.

### 21.4 Declining

`FR-7.8`. A decline records actor, timestamp, suggested amount and a mandatory
reason; **posts nothing**; and removes the candidate from the `S-05` queue
while staying visible in the day's history.

**A declined candidate is not re-proposed for the same day unless that day's
attendance data changes.** Store the decline against the day and compare
against it before re-proposing — otherwise every recalculation resurrects it
and the queue becomes noise.

### 21.5 Warning before expiry

`FR-7.4`: warn the user and `OFFICE_ADMIN` before PTO expires unused, and list
unapproved candidates so nothing is silently lost. Surfaces on `S-05` and
`S-04`.

## 22 CTO

`FR-7.5`. **CTO has no balance of its own.** It is one of the two ways to
spend PTO, the other being taking a paid day off.

### 22.1 Applying CTO spends PTO

`BR-26`, and the rule most likely to be missed:

```
applyCto({ userId, date, amount, actor, override }):
  1. available = replayBalance(userId, PTO, date), counting UNEXPIRED awards only
  2. if available < amount and !override:
       BLOCK. The deduction stands and comes out of
       teamPolicy.automaticDeductionLeaveType (seeded Casual).
       Queue the block on S-05.
  3. OFFICE_ADMIN may override the block explicitly — audited (FR-6.10)
  4. on approval:
       append PTO debit          (CTO_APPLIED, −amount)
       append reversal of that day's AUTOMATIC_DEDUCTION   (the deduction is cancelled)
```

Both movements post in the same operation. A CTO application that debits PTO
without cancelling the deduction charges the user twice.

### 22.2 Seeded application ladder

| Rule | Lateness | Applies | On a 9 h shift |
| ---- | -------- | ------- | -------------- |
| `BR-22` | 22% to < 44% | 0.25 | 2 h to < 4 h |
| `BR-23` | 44% to < 67% | 0.5 | 4 h to < 6 h |
| `BR-24` | ≥ 67%, having attended | 0.75 | ≥ 6 h |
| `BR-25` | Did not attend at all | 1 | — |

Each is subject to the `BR-26` balance check. On `BR-25`, **no leave is
deducted** when the CTO is applied.

As with PTO, the system names the applicable row and proposes; `OFFICE_ADMIN`
may accept, change, decline, or apply CTO on a day the system did not suggest
one.

### 22.3 Naming the rule

`FR-7.6`: for any given day, name the rule that produced each credit and each
debit. Where `OFFICE_ADMIN` granted something the system did not suggest,
record the rule as `MANUAL_GRANT` with no ladder row. The `rule` field on the
ledger entry carries this and `S-12` and `S-14` display it.

## 23 Overrides and recalculation

### 23.1 Overrides live on the record

`FR-6.11`. Stored on the day, the award, the application or the entitlement —
as the new value **beside** the engine's value, with who, why and when.
**There is no separate override record.**

`FR-6.10` lists exactly nine kinds: a late arrival, a short day, a day status,
the hours on a day, a CTO application, a PTO award, a leave entitlement, a PTO
expiry, and an insufficient-PTO-balance block.

An override may change an amount, remove it completely, add an outcome the
engine never produced, or permit an action the engine refused.

Where an override moves a balance, the movement **posts to the ledger in the
normal way**, and a movement already posted is cancelled by a reversing entry
rather than edited.

### 23.2 Recalculation never destroys a decision

`FR-6.12`, `DC-7`, `I-6`. This is the invariant most at risk during Part III.

```
recalculateDay(dayRecord):
  dayRecord.computed = <freshly computed values>     // always rewritten
  dayRecord.override = dayRecord.override            // NEVER touched
```

A re-import, a punch fixed under `FR-4.12`, a calendar edit or a policy change
**shall never quietly undo an `OFFICE_ADMIN` decision or an approved credit**.

Make this a test in its own right: override a day, recalculate, assert the
override survives and the computed value refreshed.

### 23.3 The recalculation entry point

Per decision **D-2**, one function, called synchronously:

```
recalculateDays(userId, fromDate, toDate):
  for each date in range within the user's employment period:      // FR-2.12
    1. resolve team and shift held ON THAT DATE
    2. load punches whose work date is this date
    3. recompute work dates if the shift assignment changed         §13
    4. pair punches → workedMinutes, exceptions                     §14
    5. dayType   = resolveDayType(...)                              §15
    6. computed.dayStatus = resolveDayStatus(...)                   §16
    7. lateness, early, short day                                   §17
    8. deduction from the ladder                                    §18
    9. reconcile ledger entries for this day:                       §19
         - append any entry the source now implies (idempotent by index)
         - REVERSE any entry whose source no longer implies it
    10. re-evaluate PTO / CTO candidates; respect prior declines    §21.4
    11. write the record with $inc version, audit the change
```

**Step 9 reconciles rather than deletes.** An entry that should no longer
exist is reversed, never removed (`I-1`).

### 23.4 What triggers it, and over what range

| Trigger | Range | Notes |
| ------- | ----- | ----- |
| Punch added, edited, soft deleted (`FR-4.12`) | The day it left **and** the day it moved to | At most 2 days. MVP criterion 18. |
| Day override set or cleared | That day | |
| Leave recorded or cancelled | The leave's dates | |
| Shift assignment changed (`FR-3.6`) | The assignment's effective range | Work dates recompute (§13) |
| Team move (`FR-3.14`) | **From the effective date forward only** | Never rewrites history |
| Holiday added, edited, removed (`BR-15`) | That date, **all users on that team** | Widest fan-out — warn first |
| Policy or ladder change (`FR-6.4`) | From its effective date, that team | Warn that overrides survive |
| Tenure changed / user restored | The affected range | May restore soft-deleted records |

For the two widest cases, `S-17` already specifies the behaviour: **saving a
policy change warns that it triggers recalculation from its effective date,
and that existing overrides survive it.** Show the affected date range and
user count in that warning.

### 23.5 Determinism

`NFR-8`: re-running a past period on unchanged inputs and configuration
produces identical output. Two consequences for how you write engine code:

- **No `new Date()` inside a calculation.** "Now" is an argument, passed in.
  A function that reads the clock cannot be re-run over a past period.
- **No reliance on document order.** Sort explicitly before pairing or
  replaying.

---

# Part III — Modules

Each section replaces stubs with working screens. Every one of them applies
Part I in full — the layers are not restated per module.

**The unit of work is a screen.** Read its entry in `list-of-screens.md`
first: it states the access, spec references, columns, behaviour and states,
and this section adds only what that document leaves to the implementer.

## 24 M-6 · Organisation and Policy

**Screens:** `S-16` Teams · `S-17` Team configuration
**Popups:** `P-28`–`P-39`
**Build first.** Attendance cannot classify a day without a shift, a calendar
and a weekly-off pattern.

### 24.1 What to build

1. **Teams CRUD** (`S-16`, `P-28`, `P-29`). Exactly one manager per team
   (`FR-3.1`).
2. **Shifts** (`P-30`): name, start, end, required daily duration, grace,
   **timezone**. Set the team default (`FR-3.3`, `FR-3.4`).
3. **Holiday calendar** (`P-31`): typed entries, per team (`FR-3.7`).
4. **Weekly off pattern** (`P-32`): not assumed Saturday/Sunday (`FR-3.8`).
5. **Leave policy** (`P-33`, `P-34`) and **ladders** (`P-35`–`P-37`).
6. **Thresholds and windows** (`P-38`, `P-39`).
7. **Shift assignment with effective date ranges** (`P-12`, `FR-3.6`).

### 24.2 Contracts

| Method | Route | Permission |
| ------ | ----- | ---------- |
| `GET` | `/api/teams` | `team.read` |
| `POST` `PATCH` | `/api/teams`, `/api/teams/[id]` | `team.write` |
| `POST` | `/api/teams/[id]/soft-delete` | `team.write` |
| `GET` `PUT` | `/api/teams/[id]/policy` | `config.read` / `config.write` |
| `POST` `PATCH` | `/api/shifts`, `/api/shifts/[id]` | `config.write` |
| `POST` `PATCH` `DELETE` | `/api/teams/[id]/holidays` | `config.write` |

### 24.3 Traps

- **Soft deleting a team is rejected while any non-soft-deleted user is
  assigned to it**, naming those users so they can be *moved* first — moved,
  not deleted (`FR-3.2`, `P-29`). A team with only past assignments may go.
- A soft-deleted team **stays readable**, so historical day records still
  resolve through the calendar and policy it held.
- Editing a holiday mid-year is legitimate and **triggers recalculation of the
  affected dates** (`BR-15`) — the widest fan-out in the system (§23.4).
- Every unset required value is flagged inline **and** queued on `S-05` until
  set (`FR-3.13`, `I-5`).
- **No company-wide timezone setting exists and none may be added.** `S-18`
  states this on screen.

## 25 M-4 · Attendance

**Screens:** `S-09` overview · `S-10` daily grid · `S-11` import · `S-12` day detail
**Popups:** `P-21`–`P-25`, `P-07`
**Depends on:** M-6, and Part II.

### 25.1 What to build

1. **Punch CRUD** (`P-21`, `P-22`): time, type, and the user it belongs to.
2. **The engine pipeline** (Part II), invoked by `recalculateDays`.
3. **`S-10` daily grid**: one team, one date, the write surface. Three clicks
   or fewer from `S-04` (`NFR-1`).
4. **`S-12` day detail**: punches, computed values, deduction with its named
   rule, and each override beside the engine value.
5. **`S-09` overview**: aggregate statistics over a date range.
6. **`S-11` Excel import**: upload → confirm date format → preview → atomic
   commit.
7. **Day overrides** (`P-23`, `P-24`, `P-25`).

### 25.2 Contracts

| Method | Route | Permission |
| ------ | ----- | ---------- |
| `GET` | `/api/attendance?from&to&teamId&userId` | `attendance.read` |
| `GET` | `/api/attendance/[userId]/[date]` | `attendance.read` |
| `POST` `PATCH` | `/api/punches`, `/api/punches/[id]` | `attendance.write` |
| `POST` | `/api/punches/[id]/soft-delete` | `attendance.write` |
| `PATCH` | `/api/attendance/[userId]/[date]/override` | `attendance.write` |
| `POST` | `/api/attendance/import/validate` | `attendance.import` |
| `POST` | `/api/attendance/import/commit` | `attendance.import` |

### 25.3 The import

`FR-4.2`–`FR-4.5`, `FR-4.11`. Format: `Sr No.`, `Employee Code`,
`Employee Name`, `Type`, `Date`, `Time`.

1. **Confirm the date format before validation runs** (`FR-4.11`). Reject any
   row whose date cannot be parsed unambiguously under it, stating that as the
   reason.
2. **Preview accepted against rejected, with a stated reason for each
   rejection** — before anything is committed (`FR-4.4`). Reasons: no employee
   code; a code matching no user; **an untracked user**; an unparseable date;
   a date outside the employment period.
3. **`Employee Code` is the only match key.** `Employee Name` is displayed for
   the reader and **never** used to match (`FR-4.3`).
4. **Commit atomically** (`FR-4.5`): every accepted row or none. This is a
   guarantee about the observable outcome, not about the number of database
   calls — a partially applied import must never be queryable.
5. `NFR-4`: 40,000 rows validate and preview in under 10 seconds. Validate in
   memory against one bulk-loaded map of employee codes; do not query per row.

### 25.4 Traps

- **A punch is not immutable** (`FR-4.12`). A wrong punch is fixed by *editing
  it* — never by adding a cancelling punch, never by overriding the day. Every
  fix is a manual adjustment under `FR-4.10`, is audited, and recalculates
  **both** the day it left and the day it moved to.
- Reject a punch change that would move it outside the employment period or
  onto an untracked user, stating that as the reason.
- **Untracked users do not appear on `S-10`** — they receive no day records.
  On `S-09` they are excluded from totals **and the exclusion is stated**, not
  left silent (`FR-2.10`).
- A day whose shift is unknown shows an **empty status** and links to `P-12`
  (`FR-3.12`) — not a guessed status.
- **Re-running an import must not undo an override already applied** (`I-6`,
  MVP criterion 18).

## 26 M-5 · Leave and Balances

**Screens:** `S-13` balances · `S-14` ledger · `S-15` PTO and CTO
**Popups:** `P-19`, `P-20`, `P-26`, `P-27`, `P-01`–`P-04`
**Depends on:** M-4 and Part II §19–§22.

### 26.1 What to build

1. **Ledger writes and replay** (§19).
2. **`S-13`**: typed balances per user, per month and per year. Every figure
   links to `S-14`.
3. **`S-14`**: every movement in order, with running balance, named rule,
   actor, reason and reversal marker. **Read only — nothing here can be edited
   or deleted.**
4. **Record leave** (`P-26`): **type is mandatory**; a leave without one is
   rejected, which is why no consumption order between types is ever needed
   (`FR-6.2`).
5. **Opening balances** (`P-19`) and **entitlement override** (`P-20`).
6. **PTO and CTO** (`S-15`, `P-01`–`P-04`, `P-27`).

### 26.2 Contracts

| Method | Route | Permission |
| ------ | ----- | ---------- |
| `GET` | `/api/leave/balances?from&to&teamId&userId` | `leave.read` |
| `GET` | `/api/leave/[userId]/ledger` | `leave.read` |
| `POST` | `/api/leave` | `leave.write` |
| `POST` | `/api/leave/opening-balance` | `leave.write` |
| `GET` | `/api/pto` | `pto.read` |
| `POST` | `/api/pto/[id]/approve` · `/decline` | `pto.approve` |
| `POST` | `/api/pto/originate` | `pto.approve` |
| `POST` | `/api/cto/[id]/approve` · `/decline` | `pto.approve` |

### 26.3 Traps

- **Paternity and maternity never consume the standard balance** (`FR-6.9`).
  They post to their own typed balance. The workbook's `+ H` term does not
  carry over.
- **Half a day of leave is `LEAVE`** with a half-day ledger amount, not a
  status of its own.
- **`S-14` offers no edit or delete anywhere**, because no endpoint provides
  one. Entries of note carry their own label: opening balance at cutover,
  lapsed on departure, PTO expiry.
- A user created after cutover has **no opening entry**, and the screen says
  so rather than showing a zero row.
- **Nothing posts to the ledger until approved** (`FR-7.1`).

## 27 M-2 · Exceptions

**Screen:** `S-05` · **Popups:** `P-01`–`P-07`, `P-12`, `P-21`
**Depends on:** every module that raises an exception. Build the frame early,
add tabs as their sources land.

### 27.1 The twelve queues

Each is a tab with a count. `FR-8.6` requires all of them.

| Tab | Raised by | Source |
| --- | --------- | ------ |
| Missing check in or check out | `FR-4.8` | §14.1 pairing |
| Duplicate punch | `FR-4.7` | duplicate window |
| Impossible duration | `FR-8.6` | > 24 h, or out before in |
| Date with no shift assigned | `FR-3.12` | §13.1 step 2 |
| Required configuration not set | `FR-3.13` | §8.3 |
| Unmatched import row | `FR-4.4` | §25.3 |
| Unresolved late arrival | `FR-6.10` | §17 |
| Exhausted leave or PTO balance | `FR-8.6` | replay < 0 |
| PTO approaching expiry | `FR-7.4` | §21.3 |
| PTO awaiting approval | `FR-7.1` | §21.1 |
| CTO awaiting approval | `FR-7.5` | §22 |
| Employment-period reduction | `FR-2.11` | `approvals` |

### 27.2 How exceptions are stored

**Derive them, do not accumulate them.** An exception is a *conclusion about
current state*, so a stored queue drifts the moment the underlying record is
fixed by another route.

- Day-level exceptions live in `dayRecord.exceptions` (an array of codes),
  rewritten by every recalculation. Self-healing: fixing the punch clears it.
- Approval-workflow items (`FR-2.11`, PTO, CTO) are genuine records with
  status, because a human decision must persist.

### 27.3 Traps

- **Paged, never fully materialised** — the backlog grows with the roster
  (`NFR-3`, `DC-10`).
- Empty per tab reads **"Nothing outstanding"**, not an empty grid.
- Each row offers approve, approve with a changed amount, and decline where
  they apply.
- The dashboard also lets `OFFICE_ADMIN` **start** a PTO award or CTO
  application for a user and date that raised no suggestion (`P-04`).

## 28 M-3 · People, the remainder

Roster, detail Overview/Tenures/History, create, soft delete and restore are
**already built**. What remains:

1. **`S-07` tabs**: Shift assignments (`FR-3.6`), Team assignments
   (`FR-3.14`), Attendance, Leave and balances.
2. **`P-09`** edit user · **`P-10`** change role · **`P-11`** move team ·
   **`P-12`** assign shift · **`P-13`** toggle tracked · **`P-14`** toggle
   login.
3. **`P-17`, `P-18`** tenure add/edit/soft delete.
4. **`S-08`** roster import.
5. **`FR-2.11`** employment-period reduction approval, end to end.

### 28.1 Traps

- **Changing role to `MANAGER` names the team and replaces its previous
  manager in the same action**, so "exactly one manager" holds before and
  after (`FR-1.7`, `FR-3.1`).
- **Moving a team** records an effective date range and **triggers
  recalculation from that date forward only** — it never rewrites history
  (`FR-3.14`). Where the user held the team default shift they take the new
  team's; where they held their own they keep it.
- **A user always keeps at least one non-soft-deleted tenure** (`FR-2.12`).
- **Editing a tenure corrects a wrong date but cannot close an open one** —
  only soft-deleting the user closes a tenure (`FR-2.2`).
- Tenures **must not overlap** and must not end before they start.
- **A tenure is not a way to record absence.** Long leave sits *inside* one
  tenure and is recorded as leave.
- Toggling tracked **deletes no attendance history**; turning it on starts
  producing day records from that point forward (`FR-2.10`).

## 29 M-7 · Config and access control

**Screens:** `S-18` company configuration · `S-19` access control matrix
**Popups:** `P-40`, `P-41`, `P-42`

### 29.1 What to build

1. **Employment types** (`P-40`) and **authorised domains** (`P-41`).
2. **`S-19`**: rows are permissions, columns are the four roles, each cell a
   scope of `SELF`, `TEAM`, `ALL` or none.

### 29.2 Traps

- **`validateGrants` already enforces `FR-1.3`** and runs on write, so `S-19`
  cannot violate it regardless of what the client sends. The UI should also
  render the `OFFICE_ADMIN` column as locked, but the server is the guarantee.
- **The four roles are the complete set.** The screen offers no way to add a
  fifth.
- `MANAGER`'s `TEAM`-scoped leave approval is **already seeded** and visible
  here from day one, though its workflow is post-MVP (`FR-6.7`, `DC-12`).
- **MVP criterion 7** is the acceptance test: move a permission from one role
  to another and it takes effect on the next request, with no redeploy.

## 30 M-8 · Reports

**Screens:** `S-20` report builder · `S-21` annual summary · **Popup:** `P-43`
**Depends on:** everything. Build last.

### 30.1 Traps

- **Any date range, not only a calendar month** (MVP criterion 10).
- **Working-day and holiday counts derive from the calendar of the team the
  user held on each date**, not their current team (`FR-3.9`, `FR-3.14`).
  MVP criterion 19.
- **Untracked users are excluded and the exclusion is stated** (`FR-2.10`).
- **Soft-deleted users appear with unchanged totals**, marked *no longer
  active* (`FR-2.4`).
- A **tenure gap** shows as employed either side with no day records inside.
- **`S-21` includes every month.** A month with no data is an explicit zero
  row, never silently omitted — this is workbook defect **F1** and MVP
  criterion 9. Months outside the employment period are marked as such rather
  than shown as absence.
- **`S-20` is not granted to `EMPLOYEE`**, unlike the `S-09` read surface
  (`FR-8.1`).
- `NFR-3`: a full-company month at the `NFR-5` ceiling renders under 2 seconds
  at p95, **paged rather than materialised whole**.

## 31 M-9 · Audit

**Screen:** `S-22` · **Popup:** `P-44`

Mostly already satisfied — `writeAuditRecord` and `getRecordHistory` exist and
every built mutation calls them. What remains is the read surface: a paged,
filterable log (actor, action, entity type, date range) and the `P-45` record
history drawer.

**Read only without exception**, because no application endpoint offers an
edit or delete (`FR-9.3`). Never empty in practice — the seed and the roster
import both write records.

---

# Part IV — Sequencing

## 32 Build order

**Dependency order, not the supervisor's phase numbering** (decision `D-3`).
Where the agreed plan differs, it decides *when*; this says what breaks if you
go earlier.

```
  ✔ 0  Boilerplate                                        DONE
        │
        ▼
    1  M-6 Organisation and Policy          §24
        teams · shifts · calendars · weekly off · policy · ladders
        └─ nothing can classify a day without these
        │
        ▼
    2  Engine core                          §13–§18
        work date · duration · day type · day status · lateness · deduction
        └─ pure functions, no screens. Test exhaustively here.
        │
        ▼
    3  M-4 Attendance capture               §25
        punches · S-10 grid · S-12 detail · recalculateDays
        └─ MVP criteria 2, 12, 18
        │
        ▼
    4  Ledger and leave engine              §19–§20, §26
        entries · replay · accrual · lapse · opening balances
        └─ MVP criteria 5, 11
        │
        ▼
    5  PTO and CTO                          §21–§22
        └─ MVP criterion 8
        │
        ├──────────────┐
        ▼              ▼
    6  M-2 Exceptions  7  M-4 import        §27, §25.3
        └─ criterion 3
        │
        ▼
    8  M-3 remainder                        §28
        tenures · assignments · roster import · FR-2.11 approvals
        └─ MVP criteria 15, 16, 17, 19
        │
        ▼
    9  M-8 Reports                          §30
        └─ MVP criteria 9, 10, 13
```

`S-18` and `S-19` (§29) have no dependencies and can be built whenever
convenient. `S-22` (§31) needs only its read surface and can slot in
alongside.

**Why this order.** Each step's output is the next step's input. Building
attendance before shifts means inventing a shift; building reports before the
ledger means inventing a balance. Both produce code that is thrown away.

## 33 Definition of done

A module is done when **all** of these hold. Not some.

1. `npm run lint` exits 0.
2. `npm test` passes, including new tests written **before** the code.
3. `npm run build` succeeds.
4. Every screen in the module renders its empty, loading and error states.
5. Every mutation writes an audit record.
6. Every mutation takes and checks a `version`.
7. Every mutation that can change a displayed number calls `recalculateDays`.
8. No hard delete was added anywhere.
9. No number from §3.10 was typed into a `.js` file.
10. The API contract is asserted from both sides.
11. `README.md` is updated — it is the spec-first feature list.
12. The relevant MVP acceptance criteria in `spec.md` §3.11 demonstrably pass.

## 34 Traceability

Every requirement group, and where this document explains it.

| Requirements | Section |
| ------------ | ------- |
| `FR-1.x` identity, authentication, access control | §3, §29 |
| `FR-2.x` users and lifecycle | §28 · built: §0.2 |
| `FR-3.x` org, shifts, calendars | §24 · time: §7 |
| `FR-4.x` attendance capture | §25 · duration: §14 |
| `FR-5.x` day classification | §13, §15, §16, §17 |
| `FR-6.1`–`FR-6.5` leave engine | §18, §19 |
| `FR-6.6` accrual and carry forward | §20 |
| `FR-6.8` immutable ledger | §19 |
| `FR-6.10`–`FR-6.12` overrides | §23 |
| `FR-6.13` opening balances | §20.4 |
| `FR-7.x` PTO and CTO | §21, §22 |
| `FR-8.1`–`FR-8.5` reporting | §30 |
| `FR-8.6` exceptions dashboard | §27 |
| `FR-9.x` audit | §4, §31 |
| `NFR-3`, `NFR-5`, `DC-10` scale and paging | §2.4, §30 |
| `NFR-8`, `NFR-15`, `DC-9` determinism and idempotency | §19.3, §23.5 |
| `NFR-9`, `DC-3` nothing destroyed | §5 |
| `NFR-11` traceability of every number | §19 |
| `NFR-12`, `NFR-2`, `DC-11` accessibility | §10.5 |
| `NFR-14` concurrency | §6 |
| `DC-1`, `NFR-10` policy as data | §8 |
| `DC-5` time through the shift | §7, §13 |
| `DC-6` no fallbacks | `I-5`, §8.3, §13.1 |
| `DC-12` Phase 2 needs no migration | §2.2, §29 |

### Requirements with no screen, by design

`spec.md` §8 lists these; they are satisfied without a surface of their own
and are explained here instead: day classification (§13–§17) surfaces on
`S-12`; automatic deduction (§18) is computed, not entered; the immutable
ledger (§19) is a storage rule whose read surface is `S-14`; time resolution
(§7, §13) has deliberately no company-wide timezone screen to build.

---

*Where this document and `spec.md` disagree, `spec.md` wins and this document
is wrong. Fix it here, in the same change.*

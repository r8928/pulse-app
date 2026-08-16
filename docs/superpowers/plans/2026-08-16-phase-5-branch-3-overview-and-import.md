# Phase 5 Branch 3 · Attendance Overview and Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two remaining M-4 screens — `S-09`, which totals what the engine
concluded across a date range, and `S-11`, which loads punches in bulk from the
biometric Excel export without ever half-applying a file.

**Architecture:** `S-09`'s totals are computed by a MongoDB aggregation in
`database.js` (Ahmar's decision, 2026-08-16) rather than by pulling records
into the server process — `NFR-3` puts a full-company month under two seconds
at p95 and `NFR-5` sizes for 1000 users over 5 years. `S-11` follows `S-08`'s
shape exactly: a pure validator in `utils/`, a two-step route (validate, then
commit), and an atomic commit.

**Tech Stack:** MongoDB aggregation pipeline, ExcelJS, Next.js route handlers,
MUI v9, Vitest.

**Spec:** `list-of-screens.md` `S-09`, `S-11`; `ARCHITECTURE.md` §25.2, §25.3;
`spec.md` `FR-4.2`–`FR-4.5`, `FR-4.11`, `FR-5.6`, `FR-5.7`, `FR-2.4`,
`FR-2.10`, `NFR-3`, `NFR-4`.

## Global Constraints

Every constraint from Branch 2a and 2b still applies: no query outside
`database.js`, no domain literal outside `constants/`, no `new Date()` for
parsing, MUI v9 only, TDD throughout, contract tests from both sides, lint
clean before each commit.

Two specific to this branch:

- **`Employee Code` is the only match key** (`FR-4.3`). `Employee Name` is
  displayed for the reader and never used to match. A test asserts this.
- **The date format is confirmed before validation runs** (`FR-4.11`), and a
  row whose date cannot be parsed unambiguously under it is rejected with that
  as the stated reason. `03/04/2026` is a different day under two formats and
  the system must not pick one.

## Decisions this plan locks in

### D-19 · `S-09` shows no PTO balance until the ledger replays

`list-of-screens.md` lists a PTO balance column on `S-09`. A PTO balance is
`approved awards − PTO taken − CTO applications − expiries` replayed from the
ledger (`BR-14`), and none of those entry types exists before Branch 4.

**Decision:** the column is rendered, and states that balances arrive with the
ledger's read surface. A zero would be a figure, and a wrong one — `DC-6`
forbids presenting a gap as a value.

*If overruled:* drop the column until Branch 4 and add it there.

---

### Task 1: `database.js` — the `S-09` aggregation

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.attendanceSummary.test.js`

**Interfaces:**
- Produces `summariseAttendance({ from, to, teamId, userId, includeDeleted })`
  → `{ rows, untrackedCount }`, each row
  `{ userId, fullName, employeeCode, deletedAt, present, absent, wfh, holidayWork, lateDays, shortDays, leaveByType: { [type]: number } }`.

Every total reads the **effective** value — `$ifNull: ['$override.x', '$computed.x']` —
so an administrator's decision counts exactly as the engine's own conclusion
would (`FR-6.11`). Doing this in the pipeline rather than in JS is the whole
point of the task; a total computed two different ways on two screens is the
drift `NFR-8` exists to prevent.

- [ ] **Step 1: Write the failing tests.** Against the real in-memory Mongo.
  Assert:
  - a range with a worked day, an absence and a day of leave totals each into
    its own column;
  - leave is broken down by type, not lumped together (`FR-5.7`);
  - a day whose status was overridden counts as the override, not the engine's
    value;
  - a late day counts once however late it was, and a short day likewise;
  - an untracked colleague contributes nothing and is counted separately, so
    the screen can state the exclusion (`FR-2.10`);
  - a soft-deleted colleague's figures inside their employment period are
    unchanged and the row is marked (`FR-2.4`);
  - `teamId` and `userId` each narrow the result;
  - a range with no records returns no rows rather than throwing.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement the pipeline**
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Lint and commit**

---

### Task 2: `components/attendance/AttendanceOverview.jsx` (`S-09`)

**Files:**
- Create: `components/attendance/AttendanceOverview.jsx`
- Test: `components/attendance/__tests__/AttendanceOverview.test.jsx`

**Interfaces:**
- `<AttendanceOverview rows teams filters untrackedCount />`, filters being
  `{ from, to, teamId, userId, justMe, includeDeleted }`.

- [ ] **Step 1: Write the failing test.** Assert:
  - each column shows its total for a row;
  - leave columns appear per type;
  - the untracked exclusion is stated when there is one and silent when there
    is not (`FR-2.10`);
  - a colleague who has left is marked *no longer active* and their figures are
    still shown (`FR-2.4`);
  - the PTO column says balances arrive with the ledger rather than showing 0
    (`D-19`);
  - an empty range says so rather than rendering an empty table;
  - each row links to that person.
- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 3: `utils/attendanceImport.js` — the pure validator

**Files:**
- Create: `utils/attendanceImport.js`
- Test: `utils/__tests__/attendanceImport.test.js`

**Interfaces:**
- Produces `DATE_FORMATS` — the formats `FR-4.11` offers, each with a label and
  a `date-fns` pattern.
- Produces `validateAttendanceRows(rows, { usersByCode, dateFormat })` →
  `{ accepted, rejected }`, where `accepted` carries
  `{ sheetRow, employeeCode, userId, at, type }` and each `rejected` carries a
  stated `reason`.

`usersByCode` is a Map built once by the caller — `NFR-4` requires 40,000 rows
to validate in under ten seconds, which rules out a query per row.

- [ ] **Step 1: Write the failing tests.** Assert each rejection reason
  §25.3 names, as its own case:
  - no employee code;
  - a code matching no user;
  - an untracked user;
  - a date unparseable under the confirmed format;
  - a date outside that user's employment period;
  - and that `Employee Name` is never used to match — a row whose name is
    wrong but whose code is right is accepted, and the name in the sheet does
    not overwrite the stored one (`FR-4.3`).

  Plus: a valid row resolves to an instant in the user's shift timezone; both
  offered date formats parse the dates they claim to; `03/04/2026` under
  `DD/MM/YYYY` and under `MM/DD/YYYY` produce genuinely different days.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Lint and commit**

---

### Task 4: `database.js` — the atomic commit

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.attendanceImport.test.js`

**Interfaces:**
- Produces `loadImportContext({ codes })` → `{ usersByCode }`, one bulk query.
- Produces `commitAttendanceImport(rows, actor)` →
  `{ inserted: number, userIds: string[], dates: string[] }`.

`FR-4.5`: every accepted row is written or none is. That is a guarantee about
the observable outcome, not about the number of database calls — a partially
applied import must never be queryable.

- [ ] **Step 1: Write the failing tests.** Assert: every row lands; the punches
  carry `source: 'IMPORT'`; an audit record names the import; a failure
  part-way through leaves nothing behind; and the returned users and dates are
  what the caller must recalculate.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement** — `insertMany` in one call, ordered, so a failure
  rejects the whole batch.
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Lint and commit**

---

### Task 5: `/api/attendance/import/validate` and `/commit`

**Files:**
- Create: `app/api/attendance/import/validate/route.js`,
  `app/api/attendance/import/commit/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.attendanceImport.test.js`

| Method | Route | Permission | Body | Success |
| ------ | ----- | ---------- | ---- | ------- |
| `POST` | `/api/attendance/import/validate` | `attendance.import` | multipart: `file`, `dateFormat` | `200` `{ accepted, rejected }` |
| `POST` | `/api/attendance/import/commit` | `attendance.import` | `{ rows }` | `200` `{ inserted, recalculated }` |

- [ ] **Step 1: Write the failing contract tests.** Assert: `403` without
  `attendance.import` naming it; `400` when no date format was confirmed
  (`FR-4.11` — validation must not run first); a preview returns accepted and
  rejected with reasons and **writes nothing**; the commit writes every row and
  recalculates the dates it touched, so a day record exists straight
  afterwards.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**, reading the sheet the way `app/api/users/import`
  already does.
- [ ] **Step 4: Add the route rules** gating on `ATTENDANCE_READ`, above the
  dynamic `/api/attendance` pattern that would otherwise swallow them.
- [ ] **Step 5: Run and watch them pass**
- [ ] **Step 6: Lint and commit**

---

### Task 6: `components/attendance/AttendanceImport.jsx` (`S-11`)

**Files:**
- Create: `components/attendance/AttendanceImport.jsx`
- Test: `components/attendance/__tests__/AttendanceImport.test.jsx`

Four steps, in `S-11`'s stated order: upload → **confirm the date format** →
preview accepted against rejected → commit.

- [ ] **Step 1: Write the failing test.** Assert:
  - the date format must be confirmed before the file can be validated;
  - the preview shows accepted and rejected counts and every rejection's
    stated reason;
  - the commit button is disabled while there is nothing accepted;
  - a rejected file is corrected and re-uploaded without leaving the page
    (`NFR-1`);
  - the employee name is shown but labelled as not used for matching.
- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 7: The two pages, and branch verification

- [ ] **Step 1:** Replace `app/(app)/attendance/page.js` with `S-09`'s server
  half, and `app/(app)/attendance/import/page.js` with `S-11`'s.
- [ ] **Step 2:** `npm run lint` exits 0.
- [ ] **Step 3:** `npm test` — every test passes.
- [ ] **Step 4:** `npm run build` succeeds.
- [ ] **Step 5:** Update `README.md`'s feature table and `ARCHITECTURE.md` §25
  where the build proved either wrong.
- [ ] **Step 6:** Commit and squash-merge into `main`.

---

## Self-review

**Screen coverage.** `S-09` Tasks 1, 2, 7 · `S-11` Tasks 3, 4, 5, 6, 7.

**Deliberately not here.** PTO balance on `S-09` (`D-19`, Branch 4). `P-07`
resolve-duplicate-punch is Phase 6, reached only from `S-05`. `P-45` (export)
and `P-46` (confirm) already exist.

**Type consistency.** `summariseAttendance`'s row shape (Task 1) is what Task
2 renders. `validateAttendanceRows`'s `accepted` shape (Task 3) is what Task 4
commits and Task 5 passes between its two endpoints unchanged.

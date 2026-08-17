# Phase 6 Branch 1 · PTO and CTO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One earned balance (PTO), two ways to spend it (a paid day off, or
CTO cancelling a deduction), proposed by the engine and decided only by a
human — `S-15` and the four popups behind it, end to end.

**Architecture:** Pure detection and reconciliation in `engine/ladders.js`
and `engine/candidates.js` (no storage, no clock — `§23.5`). Orchestration
(approve/decline/originate, expiry) in `engine/pto.js` and `engine/cto.js`,
the same shape as `engine/entitlement.js` and `engine/recalculate.js` —
reads through `database.js`, computes, writes back. Plain CRUD in
`database.js`. `recalculateDays` gains step 9, proposing candidates after
everything else about the day is settled.

**Tech Stack:** Plain JavaScript, MongoDB, Next.js route handlers, MUI v9,
Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-phase-6-design.md` (`D-20`–`D-27`),
`ARCHITECTURE.md` §21–§22, `list-of-screens.md` `S-15`, `P-01`–`P-04`, `P-27`,
`spec.md` `FR-7.1`–`FR-7.8`, `FR-6.10`, `BR-18`–`BR-26`.

## Global Constraints

Every constraint from Phase 5 still applies — no query outside `database.js`,
no literal outside `constants/`, no `new Date()` in a calculation, TDD
throughout, lint clean before each commit. Three specific to this branch:

- **Nothing posts until approved** (`FR-7.1`). A candidate is a document with
  `status: 'PENDING'`; the ledger is untouched until `status` becomes
  `'APPROVED'`.
- **A decision is never destroyed by a recalculation** (`I-6`, extended by
  `D-22` from day records to PTO/CTO candidates).
- **`LEDGER_ENTRY_TYPE`, `APPROVAL_STATUS` and every permission this branch
  needs already exist** in `constants/index.js` from the boilerplate — do not
  add duplicates.

---

## File structure

| File | Responsibility |
| ---- | -------------- |
| `engine/ladders.js` (extended) | `proposePtoAward`, `proposeCtoApplication` — pure detection, `D-20`. |
| `engine/candidates.js` | `reconcileCandidate({ desired, existing })` — pure `D-22` lifecycle logic, shared by PTO and CTO. |
| `database.js` (extended) | Schemas, CRUD and indexes for `ptoAwards`/`ctoApplications`; `ptoExpiryWarningDays` added to `teamPolicySchema`. |
| `engine/pto.js` | `ensurePtoExpiryPosted`, `approvePtoAward`, `declinePtoAward`, `originatePtoAward`, `overridePtoExpiry`. |
| `engine/cto.js` | `approveCtoApplication`, `declineCtoApplication`, `originateCtoApplication`. |
| `engine/recalculate.js` (extended) | Step 9: propose after everything else is settled. |
| `app/api/pto/*`, `app/api/cto/*` | The `§26.2`-shaped contracts. |
| `components/pto/*` | `S-15` and `P-01`–`P-04`, `P-27`. |

---

### Task 1: `engine/ladders.js` — `proposePtoAward`

**Files:**
- Modify: `engine/ladders.js`
- Test: `engine/__tests__/ladders.test.js`

**Interfaces:**
- Consumes: nothing from storage. `DAY_STATUS` from constants.
- Produces: `proposePtoAward({ dayRecord, nextWorkingDayRecord, shift,
  nextWorkingDayShift })` → `{ rule: 'BR-18'|'BR-19'|'BR-20', amount: number }
  | null`.

`D-20`'s algorithm exactly. `nextWorkingDayRecord`/`nextWorkingDayShift` are
`null` when no such record exists yet (untouched date, `D-18`) — treated as
"not also worked", never as "worked".

- [ ] **Step 1: Write the failing tests.** Cover:
  - a `HOLIDAY_WORK` day below a full shift's minutes proposes `BR-18`, 0.5;
  - one at or above a full shift's minutes proposes `BR-19`, 1;
  - a day that is `HOLIDAY_WORK` **and** whose next working day is also fully
    worked proposes `BR-20`, 2 — not `BR-19`;
  - a `HOLIDAY_WORK` day whose next working day worked only partially still
    proposes `BR-19`/`BR-18` on its own, not `BR-20`;
  - a day with `computed.countsAsHolidayWork === false` (below `BR-27`'s
    threshold) proposes nothing, even though the status reads `HOLIDAY_WORK`;
  - an ordinary `WFO` day proposes nothing;
  - a `null` `nextWorkingDayRecord` is treated as not worked, not as an error.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Lint and commit**

---

### Task 2: `engine/ladders.js` — `proposeCtoApplication`

**Files:**
- Modify: `engine/ladders.js`
- Test: `engine/__tests__/ladders.test.js`

**Interfaces:**
- Produces: `proposeCtoApplication({ latenessPercent, attended, ladder })` →
  `{ rule: string, amount: number } | null`. `ladder` is
  `teamPolicy.ctoApplicationLadder`, shaped as seeded (`BR-22`–`BR-25`).

Lateness-only bands, `(from, to]`, mirroring `deductionFor`'s band search
but without the clocked-percent test — `BR-22`–`25` state lateness alone.
The did-not-attend row is found by its flag, exactly as `D-14` established.

- [ ] **Step 1: Write the failing tests.** Use the exact seeded ladder shape.
  Assert: `22.1%` proposes `BR-22`, `0.25`; `44%` proposes `BR-23` (boundary
  inclusive, `(from, to]` — matching `deductionFor`'s convention); `70%`
  proposes `BR-24`, `0.75`; not attended proposes `BR-25`, `1`, found by its
  flag regardless of `latenessPercent`; `10%` (below every band) proposes
  nothing; an empty ladder proposes nothing rather than guessing.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 3: `engine/candidates.js` — the `D-22` lifecycle

**Files:**
- Create: `engine/candidates.js`
- Test: `engine/__tests__/candidates.test.js`

**Interfaces:**
- Produces: `reconcileCandidate({ desired, existing })` →
  `{ action: 'CREATE', patch } | { action: 'UPDATE', patch } | { action: 'NONE' }`,
  where `desired` is `{ rule, amount } | null` (from a propose function) and
  `existing` is the stored record or `null`.

- [ ] **Step 1: Write the failing tests.** Assert:
  - no existing record, a desired candidate → `CREATE` with `status: PENDING`;
  - no existing record, no desired candidate → `NONE`;
  - an existing `PENDING` record whose `rule`/`amount` differ from `desired`
    → `UPDATE`, carrying the new `rule`/`amount` (`I-6`: nobody decided yet);
  - an existing `PENDING` record that still matches `desired` exactly →
    `NONE` (idempotent — `I-9`);
  - an existing `PENDING` record, but `desired` is now `null` → the record is
    withdrawn: `UPDATE` setting a `withdrawn: true` flag, never silently
    deleted (matches the append-only ethos elsewhere);
  - an existing `APPROVED` record → always `NONE`, whatever `desired` says
    (`I-6` — the ledger entries it posted are the decision now);
  - an existing `DECLINED` record whose `declinedSnapshot` matches `desired`
    exactly → `NONE` (`FR-7.8`: not re-proposed for the same day);
  - an existing `DECLINED` record whose `declinedSnapshot` differs from a
    non-null `desired` → `CREATE` a fresh `PENDING` record, leaving the
    declined one untouched (`D-22`);
  - an existing `DECLINED` record and `desired` is now `null` → `NONE`.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 4: `database.js` — `ptoAwards` and `ctoApplications` schemas, indexes and CRUD

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.pto.test.js`, `__tests__/database.cto.test.js`

**Interfaces:**
- `ptoAwardSchema`, `ctoApplicationSchema` — the `D-21` shapes.
- `getPtoAwardForDate(userId, date)`, `upsertPtoCandidate(userId, date,
  patch, actor)` (applies `reconcileCandidate`'s `patch`), `listPtoAwards({
  userIds, status, from, to })`.
- The `ctoApplications` equivalents, substituting `appliedAmount` for
  `approvedAmount` and adding `blockOverridden`.
- `teamPolicySchema` gains `ptoExpiryWarningDays: z.number().int().min(0).optional()`.

Indexes: unique on `(companyId, userId, date)` partial on
`status: { $ne: 'DECLINED' }` — a declined candidate must not block a fresh
one from the same reconciliation (`D-21`, `D-22`).

- [ ] **Step 1: Write the failing tests.** Assert: creating a candidate
  stores `PENDING` with no `approvedAmount`; upserting a `patch` from
  `reconcileCandidate`'s `UPDATE` action changes the stored `rule`/`amount`
  and bumps version; two live (non-declined) candidates for the same user
  and date collide at the index; a `DECLINED` one does not block a new
  `PENDING` one for the same date; listing narrows by `status`, by user, by
  range.
- [ ] **Step 2–5:** red, implement (index in `ensureIndexes`), green, commit.

---

### Task 5: `engine/recalculate.js` — step 9, proposing candidates

**Files:**
- Modify: `engine/recalculate.js`
- Test: extend `__tests__/engine.recalculate.test.js`

**Interfaces:**
- Consumes: `proposePtoAward`, `proposeCtoApplication`, `reconcileCandidate`,
  and the new `database.js` CRUD.

After a day's `computed` block is written (§12 pipeline step 9), resolve the
**next working day's** record (needed for `BR-20`) by asking `datesToVisit`'s
team/calendar inputs for the next `WORKING`-type date and reading its
existing day record if one has been computed in this same run, else `null`.
Call both propose functions, reconcile each against its existing record, and
write per the returned `action`.

- [ ] **Step 1: Write the failing tests.** Assert, against a real database:
  - a `HOLIDAY_WORK` day proposes and stores a `PENDING` PTO candidate with
    the right rule and amount;
  - re-running the same recalculation changes nothing (`I-9`);
  - a day with high lateness proposes and stores a `PENDING` CTO candidate;
  - a candidate already `APPROVED` survives a recalculation of the day
    completely unchanged (`I-6`);
  - a `PENDING` candidate's amount updates when a punch correction changes
    the day's worked minutes;
  - a `DECLINED` candidate is not resurrected by an unrelated recalculation
    of the same day.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 6: `engine/pto.js` — expiry, approve, decline, originate, override

**Files:**
- Create: `engine/pto.js`
- Test: `__tests__/engine.pto.test.js`

**Interfaces:**
- `ensurePtoExpiryPosted(userId, actor)` — `D-24`'s guard.
- `approvePtoAward(id, { amount, reason }, version, actor)` — posts
  `PTO_AWARD` (signed positive), sets `status: APPROVED`,
  `approvedAmount`, `expiresAt` (extended per `D-24` if already past due).
- `declinePtoAward(id, reason, version, actor)` — sets `status: DECLINED`,
  `declinedSnapshot`, posts nothing.
- `originatePtoAward({ userId, date, amount, reason }, actor)` — `FR-7.7`:
  creates and immediately approves in one action, `rule: 'MANUAL_GRANT'`.
- `overridePtoExpiry(id, { expiresAt, reason }, version, actor)` — `P-27`:
  reverses any posted `PTO_EXPIRY` first (`D-24`).

- [ ] **Step 1: Write the failing tests.** Cover, against a real database:
  - approving posts a signed-positive `PTO_AWARD` entry and the balance
    reflects it (`replayBalance`);
  - approving with a changed amount posts the **changed** amount, not the
    proposed one (`FR-7.2` — unconstrained, including a figure no ladder row
    produces);
  - approving after the expiry date has passed extends `expiresAt` to 30
    days from **today** and sets `expiryExtended: true` (`FR-7.3`'s worked
    example: earned 5 August, still-unapproved past 5 September);
  - declining posts nothing and the balance is unaffected;
  - declining requires a reason;
  - originating with no prior candidate creates one already `APPROVED`,
    `rule: MANUAL_GRANT`, and posts the award;
  - the expiry guard posts `PTO_EXPIRY` for an award whose `expiresAt` has
    passed and does nothing for one that has not;
  - running the expiry guard twice posts `PTO_EXPIRY` once (`I-9`);
  - overriding the expiry of an already-expired award reverses the
    `PTO_EXPIRY` entry and the balance is restored before the new date takes
    over.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 7: `engine/cto.js` — approve, decline, originate, the `BR-26` block

**Files:**
- Create: `engine/cto.js`
- Test: `__tests__/engine.cto.test.js`

**Interfaces:**
- `approveCtoApplication(id, { amount, reason, override }, version, actor)` —
  `D-23`'s live balance check; on success, posts a PTO debit
  (`CTO_APPLIED`) **and** reverses that day's `AUTOMATIC_DEDUCTION` in the
  same call (`§22.1` — both movements or neither).
- `declineCtoApplication(id, reason, version, actor)`.
- `originateCtoApplication({ userId, date, amount, reason }, actor)`.

- [ ] **Step 1: Write the failing tests.** Cover:
  - approving with sufficient PTO posts both movements — the `CTO_APPLIED`
    debit and the reversal of that day's deduction — and the day's net
    leave cost is now zero (`§22.1`: a CTO application that debits PTO
    without cancelling the deduction charges the user twice — assert this
    does **not** happen);
  - approving with insufficient PTO and no `override` refuses (`400`), and
    posts nothing;
  - approving with insufficient PTO and `override: true` proceeds, sets
    `blockOverridden: true`, and is itself audited;
  - `BR-25` (did not attend): approving applies CTO and posts **no** leave
    deduction reversal, because none was posted in the first place (`§22.2`);
  - declining posts nothing;
  - originating posts both movements immediately, `rule: MANUAL_GRANT`.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 8: The API — `/api/pto`, `/api/cto`

**Files:**
- Create: `app/api/pto/route.js`, `app/api/pto/[id]/approve/route.js`,
  `app/api/pto/[id]/decline/route.js`, `app/api/pto/originate/route.js`,
  `app/api/pto/[id]/expiry/route.js`, `app/api/cto/route.js`,
  `app/api/cto/[id]/approve/route.js`, `app/api/cto/[id]/decline/route.js`,
  `app/api/cto/originate/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.pto.test.js`, `__tests__/api.cto.test.js`

`§26.2`'s contract table exactly, split for CTO the same way. `GET` needs
`pto.read`; every write needs `pto.approve` — including originate, per
`FR-7.7`'s "identified in the ledger as a manual grant" being an
`OFFICE_ADMIN` action throughout `§21`–`§22`.

- [ ] **Step 1: Write the failing contract tests.** Every permission, every
  `403` naming what's missing, every `400`/`409` shape matching the house
  pattern, and — the point of the whole branch — that `GET /api/pto` before
  any approval shows a `PENDING` candidate with **no** ledger entries behind
  it, and shows `PTO_AWARD` entries only after `POST .../approve`.
- [ ] **Step 2–6:** red, implement, add route rules, green, commit.

---

### Task 9: `components/pto/*` — `S-15` and its four popups

**Files:**
- Create: `components/pto/PtoAwardsTable.jsx`, `ApproveDialog.jsx`,
  `DeclineDialog.jsx`, `OriginateDialog.jsx`, `OverrideExpiryDialog.jsx`
- Test: one file each
- Replace: `app/(app)/pto/page.js`

**Interfaces:**
- `<PtoAwardsTable items filters canApprove />` — `list-of-screens.md`'s
  exact columns: user, date worked, proposed, approved, rule or manual
  grant, expiry and whether extended, status, actor, reason.

- [ ] **Step 1: Write the failing tests.** Assert: a `PENDING` row offers
  approve/decline; an `APPROVED` row shows the approved amount and the
  ladder row (or "Manual grant") that produced it; an extended expiry is
  marked as such; approving lets the amount be changed before submitting,
  including to a figure the ladder never produced; declining requires a
  reason; a viewer without `pto.approve` sees the table but no action
  buttons; `P-04`'s originate is offered even with no candidates present;
  empty states distinguish "no candidates at all" from "every candidate
  already decided".
- [ ] **Step 2–6:** red, implement, wire the page, green, commit.

---

### Task 10: Branch verification and merge

- [ ] **Step 1:** `npm run lint` exits 0.
- [ ] **Step 2:** `npm test` — every test passes.
- [ ] **Step 3:** `npm run build` succeeds.
- [ ] **Step 4:** Update `README.md`; correct `ARCHITECTURE.md` §21/§22 where
  the build proved either wrong.
- [ ] **Step 5:** Commit and squash-merge into `main`.

---

## Self-review

**Coverage.** `FR-7.1`–`FR-7.3` Tasks 5, 6 · `FR-7.5` Task 7 · `FR-7.6` Tasks
6, 7 (`MANUAL_GRANT` rule) · `FR-7.7` Tasks 6, 7 (originate) · `FR-7.8` Tasks
3, 5 · `FR-6.10`'s PTO/CTO overrides Tasks 6, 7 · `BR-18`–`BR-21` Task 1 ·
`BR-22`–`BR-26` Tasks 2, 7.

**Deliberately not here.** `S-05`'s PTO/CTO tabs (Branch 2, reading what this
branch writes). `FR-2.11`. `S-20`/`S-21`.

**Type consistency.** `proposePtoAward`/`proposeCtoApplication` (Tasks 1, 2)
return `{ rule, amount } | null`, which is exactly `reconcileCandidate`'s
`desired` (Task 3), which is exactly what Task 5 passes it and what Task 4's
`upsertPtoCandidate`/equivalent consumes as `patch`.

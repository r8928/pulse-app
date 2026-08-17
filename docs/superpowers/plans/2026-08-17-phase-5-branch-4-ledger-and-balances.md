# Phase 5 Branch 4 · Ledger and Balances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every balance in Pulse a replay of the ledger — credited,
prorated, lapsed and traceable — and put the two screens on top of it that
answer `NFR-11`: "why is this number what it is".

**Architecture:** `engine/accrual.js` is pure — leave-year arithmetic and
proration, no storage. `database.js` gains the replay, the crediting guard and
the two opening-balance writes. `engine/recalculate.js` calls the guard before
it iterates (`D-12`), which is what credits a leave year with no cron in the
system. `S-13` and `S-14` are read surfaces; `S-14` has no write path at all,
because none exists to call.

**Tech Stack:** Plain JavaScript, `date-fns`, MongoDB aggregation, Next.js
route handlers, MUI v9, Vitest.

**Spec:** `ARCHITECTURE.md` §19.2, §20, §26; `list-of-screens.md` `S-13`,
`S-14`, `P-19`, `P-20`; `spec.md` `FR-6.5`, `FR-6.6`, `FR-6.8`, `FR-6.9`,
`FR-6.13`, `FR-2.7`, `FR-5.5`, `BR-12`, `BR-13`, `BR-14`; design record
`D-12`, `D-13`.

## Global Constraints

Everything from Branches 1–3 still applies. Three that bite hardest here:

- **A balance is never stored** (`I-2`, `DC-4`). Every figure on both screens
  is a sum of entries, computed at query time.
- **A movement is cancelled only by its reverse** (`FR-6.8`). There is no
  update and no delete on `ledgerEntries`, and no endpoint offers one.
- **Crediting is idempotent** (`I-9`). The guard runs on every recalculation
  and every balance read; the second run must post nothing.

---

### Task 1: `engine/accrual.js` — leave years and proration

**Files:**
- Create: `engine/accrual.js`
- Test: `engine/__tests__/accrual.test.js`

**Interfaces:**
- `leaveYearFor(date)` → `{ start, end }` as `'YYYY-MM-DD'`. `BR-13` seeds the
  accrual period to the leave year, which is the calendar year.
- `leaveYearsTouchedBy({ from, to })` → `Array<{ start, end }>`.
- `prorate(annualEntitlement, tenureStart, leaveYear)` → `number`, rounded to
  the nearest 0.5.

`ARCHITECTURE.md` §20.2's pseudocode exactly, including its rounding decision:
half a day, because leave is transacted in half days and `6.37` is not
spendable.

- [ ] **Step 1: Write the failing tests.** Assert:
  - a date in any month resolves to that calendar year;
  - a range inside one year touches one year; a range spanning a boundary
    touches two, in order;
  - a tenure starting before the year gets the whole entitlement;
  - a tenure starting exactly at the year's start gets the whole entitlement;
  - a mid-year joiner is prorated and rounded to the nearest half day — a
    1 July start on 10 days gives 5, and 20 August gives a figure that is a
    multiple of 0.5;
  - a tenure starting after the year ends gets nothing;
  - a zero entitlement prorates to zero rather than to a fraction.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Lint and commit**

---

### Task 2: `database.js` — replay

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.replay.test.js`

**Interfaces:**
- `replayBalance(userId, leaveType, asOfDate)` → `number`.
- `listLedgerEntriesForUser(userId, { leaveType, from, to })` → entries in
  order, oldest first, for `S-14`'s running balance.
- `summariseBalances({ userIds, leaveTypes, from, to })` → per user per type
  `{ opening, credited, availed, deductions, ctoApplied, balance }`.

§19.2: `Σ amount where userId, leaveType, date <= asOfDate`. One sum, no
per-type sign table — every entry is already signed, which is why `BR-14`'s
two formulas are one implementation.

- [ ] **Step 1: Write the failing tests.** Assert:
  - an empty ledger replays to 0, not to null;
  - a credit and a debit sum;
  - an entry after `asOfDate` is excluded;
  - a reversal cancels its original exactly, leaving 0;
  - types are independent — Sick does not move Casual;
  - the WFH pseudo-type replays like any other (`D-13`);
  - the breakdown separates opening, credited, availed and deductions, and
    they add up to the balance.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 3: `database.js` — crediting and opening balances

**Files:**
- Modify: `database.js`
- Test: `__tests__/database.crediting.test.js`

**Interfaces:**
- `ensureEntitlementCredited(userId, leaveYear, actor)` → `{ credited: number }`.
  For each leave type in that team's `teamPolicy.leaveTypes`, posts an
  `ENTITLEMENT_CREDIT` prorated per §20.2, idempotent via `effectKey`.
- `postOpeningBalance({ userId, leaveType, amount, date, reason }, actor)` →
  the entry (`P-19`, `FR-6.13`).
- `overrideEntitlement({ userId, leaveType, leaveYear, amount, reason }, actor)`
  → reverses the credit and posts the corrected one (`P-20`, `FR-2.7`).

`D-12`: there is no cron in this app, so crediting piggybacks on
recalculation and on the balance read. The `effectKey` source is the tenure
plus the leave year, so a second call posts nothing.

- [ ] **Step 1: Write the failing tests.** Assert:
  - a full-year employee is credited the whole entitlement per type;
  - a mid-year joiner is credited the prorated figure;
  - a second call credits nothing (`I-9`);
  - a team with no leave types configured credits nothing rather than
    guessing (`DC-6`);
  - an opening balance posts once, carries its reason and actor, and is dated
    at cutover;
  - an entitlement override reverses the engine's credit and posts the new
    figure, leaving both visible (`FR-6.8`).
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 4: `engine/recalculate.js` — the crediting guard (`D-12`)

**Files:**
- Modify: `engine/recalculate.js`
- Test: extend `__tests__/engine.recalculate.test.js`

- [ ] **Step 1: Write the failing test.** Recalculating a date credits that
  user's leave year first, so the balance is right without any scheduled job;
  a second recalculation posts nothing more.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 5: The API — balances, ledger, opening balance, entitlement override

**Files:**
- Create: `app/api/leave/balances/route.js`,
  `app/api/leave/[userId]/ledger/route.js`,
  `app/api/leave/opening-balance/route.js`,
  `app/api/leave/entitlement/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.leave.test.js`

| Method | Route | Permission |
| ------ | ----- | ---------- |
| `GET` | `/api/leave/balances?from&to&teamId&userId` | `leave.read` |
| `GET` | `/api/leave/[userId]/ledger` | `leave.read` |
| `POST` | `/api/leave/opening-balance` | `leave.write` |
| `POST` | `/api/leave/entitlement` | `leave.write` |

- [ ] **Step 1: Write the failing contract tests.** Assert each permission,
  each 403 naming what is missing, that the ledger route is read-only (no
  `PATCH`, `PUT` or `DELETE` exported), that an opening balance without a
  reason is 400, and that reading balances credits the leave year on the way
  through (`D-12`).
- [ ] **Step 2–6:** red, implement, add route rules, green, commit.

---

### Task 6: `S-13` balances and `S-14` ledger

**Files:**
- Create: `components/leave/LeaveBalances.jsx`, `components/leave/LedgerTrace.jsx`,
  `components/leave/OpeningBalanceDialog.jsx`,
  `components/leave/EntitlementDialog.jsx`
- Test: one test file each
- Replace: `app/(app)/leave/page.js`, `app/(app)/leave/[userId]/ledger/page.js`

- [ ] **Step 1: Write the failing tests.** `S-13`: a column per leave type
  with opening, credited, availed, deductions and balance; the WFH quota and
  what is left of it (`FR-5.5`); paternity and maternity shown as their own
  typed balances that never touch the standard one (`FR-6.9`); every figure
  links to `S-14`; an empty range says so.
  `S-14`: every movement in order with a running balance, the named rule, the
  actor and reason; a reversal marked as one; opening balance, lapse and PTO
  expiry each carrying their own label; **no edit or delete control anywhere**;
  a user created after cutover told they have no opening entry rather than
  shown a zero row.
- [ ] **Step 2–5:** red, implement, green, commit.

---

### Task 7: `S-07`'s leave tab, docs, and branch verification

- [ ] **Step 1:** Take the leave tab off its placeholder in `UserDetail`, now
  that balances replay.
- [ ] **Step 2:** `npm run lint` exits 0, `npm test` passes, `npm run build`
  succeeds.
- [ ] **Step 3:** Update `README.md`; correct `ARCHITECTURE.md` §20 and §26
  wherever the build proved them wrong; record any new decision in the design
  record.
- [ ] **Step 4:** Commit and squash-merge into `main`, completing Phase 5.

---

## Self-review

**Coverage.** `S-13` Task 6 · `S-14` Task 6 · `P-19` Tasks 3, 5, 6 · `P-20`
Tasks 3, 5, 6 · replay Task 2 · accrual and proration Tasks 1, 3 · `D-12`
Task 4 · `FR-5.5`'s WFH balance Tasks 2, 6.

**Deliberately not here.** `S-15`, `P-01`–`P-04`, `P-27` and everything PTO or
CTO are `P6`. `LAPSED_ON_DEPARTURE` posting on soft delete is `FR-2.11`
territory, which `ARCHITECTURE.md` §28 leaves to Phase 6 — the entry type and
its replay behaviour exist here, the trigger does not.

**Type consistency.** `prorate` (Task 1) is called by `ensureEntitlementCredited`
(Task 3) and by nothing else. `replayBalance` and `summariseBalances` (Task 2)
are what Tasks 5 and 6 read. Every route in Task 5 matches `ARCHITECTURE.md`
§26.2.

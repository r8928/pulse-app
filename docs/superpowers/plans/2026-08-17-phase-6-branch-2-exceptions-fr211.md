# Phase 6 Branch 2 · Exceptions and FR-2.11 — Implementation Plan

**Goal:** `S-05`'s twelve queues, `S-04`'s completion, `P-05`–`P-07`, and the
`FR-2.11` employment-period reduction workflow end to end.

**Architecture:** §27.2's rule decides the shape of every queue. **Derive, do
not accumulate** — a day-level exception is a conclusion about current state,
read live from `dayRecord.exceptions` and self-healing. Only the three things
that carry a *human decision* are stored records: the `FR-2.11` approval, the
PTO/CTO candidates Branch 1 built, and (`D-26`) an unmatched import row, which
is a fact about a file nobody kept rather than a conclusion about a record.

**Spec:** `spec.md` `FR-8.6`, `FR-2.11`, `FR-2.4`, `FR-3.13`, `FR-4.7`,
`FR-4.8`, `FR-7.4`; `ARCHITECTURE.md` §27, §28 item 5, §19.5's worked example;
`list-of-screens.md` `S-04`, `S-05`, `P-05`–`P-07`.

## Global constraints

Every Phase 5 and Branch 1 constraint still applies. Three specific to here:

- **Paged, never fully materialised** (`NFR-3`, `DC-10`). The backlog grows
  with the roster, so every queue takes a page and returns a total.
- **Empty reads "Nothing outstanding"**, per tab, not an empty grid.
- **A ledger entry is never deleted or edited** (`FR-2.4`, `NFR-9`). `FR-2.11`
  approval reverses; a later restore reverses the reversals.

---

### Task 1: `importExceptions` — `D-26`

**Files:** `database.js`, `__tests__/database.importExceptions.test.js`,
`app/api/attendance/import/commit/route.js`

`recordImportExceptions(rows, actor)` writes one document per rejected row at
**commit** — never at preview, so an abandoned upload queues nothing.
`listImportExceptions({ resolved, page, pageSize })` and
`resolveImportException(id, reason, actor)` for the dismiss action.

`utils/attendanceImport.js` already produces exactly `D-26`'s shape
(`{ sheetRow, employeeCode, fullName, reason }`), so the commit route forwards
what it was given rather than recomputing anything.

---

### Task 2: `FR-2.11` detection — what a reduction strands

**Files:** `utils/employment.js` (extended), `engine/reduction.js`,
`database.js`, tests for each

- Pure: `recordsOutside(period, records)` — which dated records fall outside
  the employment period a set of tenures produces.
- `engine/reduction.js` · `checkReduction(userId, change, actor)` runs after
  any change that *reduces* a period. No stranded records → nothing raised
  and the change stands. Some → one `approvals` record naming the user, the
  change, the dates and every record.
- **A widening needs no approval** and restores anything previously soft
  deleted for the re-covered dates.

---

### Task 3: `FR-2.11` decision — approve, reject, restore

**Files:** `engine/reduction.js`, `__tests__/engine.reduction.test.js`

§19.5's worked example, as a literal test. On approval: each stranded record
gets `deletedAt`, and **every ledger entry it caused is reversed**, never
edited. On rejection: nothing moves, and `IT` can correct the date and
resubmit. A later restore reverses the reversals and the balance returns
exactly.

The user's own soft delete and loss of access **took effect immediately** and
never waited for this — asserted directly, because it is the one part of
`FR-2.11` a reader is most likely to get backwards.

---

### Task 4: the twelve queues

**Files:** `engine/exceptions.js`, `database.js`, `__tests__/engine.exceptions.test.js`

One function per queue, all returning `{ items, total }` so `S-05` renders
twelve tabs through one shape. Sources per §27.1's table. The three the spec
leaves undefined are settled here:

- **Unresolved late arrival** — a day whose lateness produced a deduction that
  nobody has waived (`P-25`) and no approved CTO application cancels. Approving
  either resolves it, which is what "unresolved" has to mean for the queue to
  ever empty.
- **Exhausted balance** — a replayed balance below zero, per leave type and for
  PTO, which is the only reading of "exhausted" that does not need a threshold
  nobody has specified.
- **PTO approaching expiry** — approved, unexpired, and expiring within
  `ptoExpiryWarningDays` (`D-27`, seeded 7).

---

### Task 5: the API

**Files:** `app/api/exceptions/route.js`, `app/api/approvals/[id]/{approve,reject}/route.js`,
`app/api/import-exceptions/[id]/dismiss/route.js`, `authz/routes.js`, contract tests

`GET /api/exceptions?queue&page` needs `exceptions.read`. The approval
decisions need `user.write` — an `FR-2.11` decision soft deletes user records,
and that is the permission that governs a user's records elsewhere.

---

### Task 6: `S-05` and `S-04`

**Files:** `components/exceptions/*`, `app/(app)/exceptions/page.js`,
`app/(app)/page.js`, tests

Twelve tabs with counts, "Nothing outstanding" per tab, `P-05`, `P-06`,
`P-07`, and `P-04` reachable from here (`§27.3`). `S-04` gains the viewer's
own snapshot and the exception counts, each linking into its tab.

---

### Task 7: gate and merge

`npm run lint`, `npm test`, `npm run build`, README and ARCHITECTURE sync,
squash-merge.

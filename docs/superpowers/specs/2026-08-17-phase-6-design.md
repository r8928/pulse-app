# Phase 6 · Complex — design

**What Phase 6 contains** is already written down: `ARCHITECTURE.md` §32.1 is
the canonical membership list (§21–§22 PTO/CTO, §27 M-2 Exceptions, the
`FR-2.11` half of §28, §30 M-8 Reports), `list-of-screens.md` states each
screen's access, columns, behaviour and states, and `spec.md` §3 holds the
requirements. None of that is repeated here.

**This document records only what those three leave open**, plus the
decisions taken with Ahmar on 2026-08-17. Where it disagrees with `spec.md`,
`spec.md` wins and this document is wrong.

---

## 1 · Delivery

Three branches, in dependency order, matching `ARCHITECTURE.md` §32.1's
Phase 6 table exactly:

| # | Branch | Contains | Why here |
| - | ------ | -------- | -------- |
| 1 | `phase-6-pto-cto` | `engine/ladders.js`'s `proposePtoAward`/`proposeCtoApplication`, `ptoAwards`/`ctoApplications` collections, `recalculateDays` step 9, `S-15`, `P-01`–`P-04`, `P-27` | Everything downstream (the exceptions dashboard's PTO/CTO tabs) reads what this produces |
| 2 | `phase-6-exceptions-fr211` | `S-05` (all twelve tabs), `S-04`'s completion, `P-05`, `P-06`, `P-07`, `FR-2.11`'s full approval workflow (shares `P-05` with the dashboard) | Needs Branch 1's PTO/CTO candidates for two of its twelve tabs |
| 3 | `phase-6-reports` | `S-20`, `S-21`, `P-43` | Aggregates across everything the previous five branches produced |

Per branch: contract tests first, every worked example in `ARCHITECTURE.md`
§21–§22 written as a literal test case, `README.md`'s feature table updated
before implementing, and `ARCHITECTURE.md` corrected in the same change
wherever the build proves it wrong (§34).

---

## 2 · Decisions taken

Numbered on from `2026-08-13-phase-5-design.md`'s `D-19`.

### D-20 · PTO candidate detection reuses the `BR-27` holiday-work signal

Ahmar's decision, 2026-08-17. `spec.md` gives no numeric rule for `BR-18`
(half a day extra), `BR-19` (a full day extra) or `BR-20` (a full night plus
the next working day) — three genuinely undecidable thresholds, and `DC-6`
forbids inventing one.

**Decision:** a `HOLIDAY_WORK` day already counted per `BR-27`
(`computed.countsAsHolidayWork === true`) is the PTO signal. No new
configuration — this is exactly what §17.4 already computes for the `FR-5.6`
report.

```
candidate = dayRecord where effective(dayRecord, 'dayStatus') == 'HOLIDAY_WORK'
            and computed.countsAsHolidayWork == true

if workedMinutes >= shift.requiredDailyMinutes:
    propose BR-19, amount 1
else:
    propose BR-18, amount 0.5

if the candidate's own team-calendar "next WORKING-type day" is ALSO fully
worked (workedMinutes >= shift.requiredDailyMinutes that day too):
    propose BR-20, amount 2, on the FIRST day — replacing its BR-19/BR-18
    proposal — and propose nothing additional on the second day, whose own
    hours are ordinary WFO
```

"The next working day" is the next date whose `dayType` (§15) is `WORKING`
for that team — skipping weekends and holidays forward, not literally
tomorrow's calendar date.

`BR-21`'s team restriction (night support, Product Owners) is not hardcoded
anywhere — it falls out on its own, because only teams whose shifts land on
holidays or weekly-offs ever produce a `HOLIDAY_WORK` day in the first place.
Hardcoding it would violate `DC-1`.

*If overruled:* the whole detector is one function,
`proposePtoAward(dayRecord, nextWorkingDayRecord, shift)`, called from one
place in `recalculateDays`. Replacing the signal changes that function's body,
not its callers.

### D-21 · PTO and CTO candidates are genuine records, not derived

`§27.2` splits exceptions into two kinds: day-level ones derived fresh every
recalculation, and "approval-workflow items… genuine records with status,
because a human decision must persist." PTO and CTO candidates are the
latter — `FR-7.8`'s decline has to survive a recalculation that doesn't
change the day.

**Decision:** `ptoAwards` and `ctoApplications` get real documents, written by
`recalculateDays` step 9 (proposing, never posting) and by `P-04` (manual
origination):

```js
// ptoAwards
{
  companyId, userId,
  date,                          // the date the extra work was performed
  rule: 'BR-19',                 // or MANUAL_GRANT
  proposedAmount: 1,
  approvedAmount: null,          // set on approval; may differ from proposed
  status: 'PENDING' | 'APPROVED' | 'DECLINED',   // reuses APPROVAL_STATUS
  expiresAt: null,                // set on approval — see D-24
  expiryExtended: false,
  declinedSnapshot: null,         // { rule, proposedAmount } — see D-22
  actorId, actorName, reason,     // the decision, not the proposal
  version, deletedAt, createdAt, createdBy, updatedAt, updatedBy,
}

// ctoApplications — the same shape, substituting `appliedAmount` for
// `approvedAmount` and adding `blockOverridden: boolean` (BR-26, D-23)
```

Unique on `(companyId, userId, date)` among live, non-`DECLINED` records —
one live candidate per day per kind, matching how `leaveRecords` is unique
per `(userId, date)` (`D-9`).

*If overruled:* nothing else references these collections directly except
`recalculateDays` step 9 and the four popups, so the shape can change without
touching the engine's calculation layer.

### D-22 · Re-proposing after a decline compares against a snapshot

`FR-7.8`: "A declined candidate shall not be re-proposed for the same day
**unless that day's attendance data changes**." This means a decline is tied
to the specific proposal it declined, not to the day as a blank slate
forever.

**Decision:** declining stores `declinedSnapshot: { rule, proposedAmount }`
on the record and sets `status: 'DECLINED'`. On the next recalculation:

- if the freshly computed candidate has the **same** `rule` and
  `proposedAmount` as `declinedSnapshot` → propose nothing (the day hasn't
  really changed);
- if it differs, or the day no longer qualifies at all → leave the declined
  record exactly as it is (`FR-7.8`: "remaining visible in the day's
  history") and insert a **new** `PENDING` record for the new proposal, if
  any.

A `PENDING` record is different: nobody has decided anything yet, so
recalculation **updates it in place** (new `rule`/`proposedAmount`, version
bumped) rather than leaving a stale proposal to be approved by accident.
An `APPROVED` record is never touched by recalculation at all — the ledger
entries it already posted are the decision now (`I-6`).

### D-23 · CTO's `BR-26` block is a live check at approval time, not a queue

§22.1's pseudocode step 2 ("BLOCK… Queue the block on `S-05`") reads as if a
block were its own exception type. It is not: `S-05`'s twelve tabs (`§27.1`)
have no thirteenth "CTO blocked" row, and `P-02`'s own spec says plainly
"Blocks when unexpired PTO is insufficient, and offers an explicit, audited
override of that block" — a behaviour of the approve action itself.

**Decision:** `approveCtoApplication` checks `replayBalance(userId, 'PTO',
date)` against the amount at the moment of approval. Insufficient balance
without `override: true` refuses the write (`400`, naming the shortfall);
`override: true` proceeds and sets `blockOverridden: true` on the record,
audited. No new collection, no new exception tab.

### D-24 · PTO expiry posts through the same no-cron guard as crediting

`D-12` already established the pattern: no cron exists, so a periodic effect
credits itself the first time anything looks at a date past it. PTO expiry is
the same shape — `FR-7.3`'s 30 days is a ledger-dated fact, not a job.

**Decision:** `ensurePtoExpiryPosted(userId, actor)` runs from the same two
places `ensureEntitlementCredited` does — before `recalculateDays` iterates,
and from the balance-read path. For every `APPROVED` award whose `expiresAt`
has passed and carries no `PTO_EXPIRY` entry yet, it posts one, idempotent via
`effectKey` exactly like every other movement.

**Approval-time extension** (`FR-7.3`'s second sentence): `approvePtoAward`
compares `today` against `date + teamPolicy.ptoValidityDays` at the moment of
approval. Past it, `expiresAt = today + ptoValidityDays` and
`expiryExtended: true`, rather than the award expiring before anyone ever
saw it.

**`P-27`'s override**: if a `PTO_EXPIRY` entry already exists (the award
expired before the override), reverse it first — an entry is never edited
(`FR-6.8`) — then set the new `expiresAt`. The guard reposts expiry later
only if the *new* date has also passed.

### D-25 · "PTO taken as leave" reuses `P-26`, with `PTO` as a pseudo leave type

The `§21` intro states it plainly: PTO is spent "either by taking a paid day
off, recorded as a leave of type `PTO` under `FR-6.2`… or by applying CTO."
`PTO` is not one of `teamPolicy.leaveTypes` — it is company-wide, not
per-team-configured, the same shape `D-13` already gave `WFH`.

**Decision:** `leaveRecords.leaveType` accepts `'PTO'` without requiring it
in the team's configured list. `engine/ledger.js`'s `desiredEntriesForDay`
special-cases it exactly as it already special-cases `WFH`: a `LEAVE` day
whose leave record has `leaveType === 'PTO'` posts `PTO_TAKEN` (debiting the
PTO balance) instead of `LEAVE_AVAILED`. `DayStatusDialog`'s leave-type list
gets `PTO` appended, shown only when the user holds an unexpired PTO balance
to spend — `P-26` still requires a type, so nothing new is needed there.

*If overruled:* the special case is one branch in `desiredEntriesForDay` and
one appended option in one dialog.

### D-26 · Unmatched import rows persist at commit time

`FR-8.6` lists "unmatched import row" as one of `S-05`'s twelve queues, but
`S-11` (Phase 5, Branch 3) writes nothing about a rejected row once the
browser tab closes — the preview response is client-side and ephemeral.

**Decision:** a new `importExceptions` collection, one document per rejected
row, written by `commitAttendanceImport` **only at commit** (not at preview —
an abandoned upload that is never committed queues nothing). Each carries
`sheetRow, employeeCode, fullName, reason, importedAt, importedBy, resolved:
boolean`. `S-05`'s tab lists the unresolved ones with a **dismiss** action
(there is nothing to approve or decline about a bad row — only acknowledge
once the sheet or roster is fixed and re-imported), audited like any other
soft-delete-shaped mutation.

### D-27 · The expiry warning window is a new, seeded policy field

`FR-7.4` requires a warning "before PTO expires unused" but states no lead
time. Unlike `duplicatePunchWindowMinutes` or `midnightCrossingWindowHours`
(deliberately left unseeded in Phase 4/5 because no source value existed to
seed from), this is an operational UX parameter, not a legal or financial
figure carried over from the workbook.

**Decision:** `teamPolicy.ptoExpiryWarningDays`, seeded to **7**. Configurable
per `DC-1` like everything else in `FR-6.4`'s list, but not treated as
"required but unset" by `policyCompleteness` — a missing value falls back to
7 rather than blocking every other screen on a figure nobody will tune on
day one.

---

## 3 · Scope boundaries

| Deferred | To | Why |
| -------- | -- | --- |
| `S-15`'s "approved" figure disagreeing with `S-13`'s balance | Not scoped | Both replay the same ledger (`D-21`'s records post through the same `postLedgerEntries` Branch 2a already built); there is only one source of truth to drift from |
| A background reminder (email, notification) for `FR-7.4`'s warning | Not scoped | `spec.md` requires it surfaced on `S-05`/`S-04`, not pushed; no notification infrastructure exists in this app |

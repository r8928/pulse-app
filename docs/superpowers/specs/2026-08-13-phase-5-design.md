# Phase 5 · Intermediate — design

**What Phase 5 contains** is already written down: `ARCHITECTURE.md` §32.1 is the
canonical membership list (Part II §13–§20 and §23, plus M-4 Attendance and M-5
Ledger and Balances), `list-of-screens.md` states each screen's access, columns,
behaviour and states, and `spec.md` §3 holds the requirements. None of that is
repeated here.

**This document records only what those three leave open**, plus the decisions
taken with Ahmar on 2026-08-13. Where it disagrees with `spec.md`,
`spec.md` wins and this document is wrong.

---

## 1 · Delivery

Four branches, in dependency order — one step finer than `ARCHITECTURE.md` §32's
own step 3, so M-4's two read/write halves get separate checkpoints the way
Phase 4 gave each module its own branch. Each is squash-merged to `main` and run
by Ahmar before the next starts (`CLAUDE.md`: major tasks on a branch, `npm test`
and `npm run build` green before merge).

| # | Branch | Contains | Why here |
| - | ------ | -------- | -------- |
| 1 | `phase-5-engine-core` | `engine/workDate.js`, `duration.js`, `classify.js`, `punctuality.js`, `ladders.js` (`deductionFor`) | Pure functions, zero DB, zero screens (§32 step 2). Everything downstream calls these. |
| 2 | `phase-5-m4a-attendance-capture` | Punches CRUD, `dayRecords`, `leaveRecords` and `P-26` (`D-16`), minimal `engine/ledger.js` (post + reconcile), `recalculateDays` real body, `S-10`, `S-12`, `P-21`–`P-25`, `S-07`'s Attendance tab | Needs branch 1's pure functions; produces the day records everything else reads |
| 3 | `phase-5-m4b-attendance-overview-import` | `S-09`, `S-11` | Needs real day records from branch 2 to show or import against |
| 4 | `phase-5-m5-ledger-balances` | Full `engine/ledger.js` replay, `engine/accrual.js`, entitlement crediting, `S-13`, `S-14`, `P-19`, `P-20`, `S-07`'s Leave tab | Needs branch 2's `recalculateDays` and ledger-posting machinery to extend |

Per branch: contract tests first (`CLAUDE.md`, `ARCHITECTURE.md` §9.3), every
worked example in `ARCHITECTURE.md` §13–§18 written as a literal test case
(§11.4), `README.md`'s feature table updated before implementing, and
`ARCHITECTURE.md` corrected in the same change wherever the build proves it
wrong (§34).

---

## 2 · Decisions taken

Numbered on from `ARCHITECTURE.md` §0.1 (`D-1`–`D-3`) and
`2026-08-13-phase-4-design.md` (`D-4`–`D-8`).

### D-9 · A leave record is a genuine engine input, not an override

`ARCHITECTURE.md` §16's `resolveDayStatus({ dayType, override, authorisedLeave,
punches })` takes `authorisedLeave` as a parameter distinct from `override` for
a reason: an override corrects what the engine concluded; a leave record is read
the same way a punch is, to *reach* a conclusion. Treating "record leave" as
setting `dayRecord.override.dayStatus = 'LEAVE'` would make step 2 of that
pseudocode dead code and collapse two genuinely different concepts.

**Decision:** `leaveRecords` — reserved in `COLLECTIONS` since the boilerplate
but never given a shape — gets this one, populated by `P-26`, read by
`recalculateDays` as the `authorisedLeave` input for that date:

```js
{
  companyId, userId,
  date: 'YYYY-MM-DD',           // one leave record per user per date
  leaveType: 'Casual',          // FR-6.2, mandatory
  amount: 1 | 0.5,
  halfDayPeriod: 'MORNING' | 'AFTERNOON' | null,   // set iff amount = 0.5
  reason, actorId, actorName,
  version, deletedAt, createdAt, createdBy, updatedAt, updatedBy,
}
```

Unique on `(companyId, userId, date)` among live records — two conflicting leave
facts for one date is not a real state, the same reasoning `createHoliday`
already applies to one team observing two holidays on one date.

*If overruled:* the collection and its one write path (`P-26`) are additive;
nothing else references it directly except the single lookup inside
`recalculateDays`.

### D-10 · Leave is recorded one date at a time

Ahmar's decision. A range-recording convenience (`P-26` accepting a start/end
date and expanding server-side, calendar-aware) is deferred — not scoped out of
the product, just out of this phase. `leaveRecords`' shape does not change if it
is added later; it would simply call the same single-date write once per date in
the range.

### D-11 · Half-day leave carries an explicit AM/PM period, and the ladder still runs on the worked half

Ahmar's decision, against my recommendation to exempt half-day leave from the
ladder entirely. Because the ladder genuinely runs, the engine needs to know
*which* half was leave — "late" is meaningless without knowing what the person
was expected to be doing first.

```
punctuality for a half-day LEAVE date:
  halfDayPeriod == AFTERNOON (worked the morning):
    checkWindow.start = shift.start                        // as an ordinary day
    requiredMinutesForLadder = shift.requiredDailyMinutes / 2

  halfDayPeriod == MORNING (worked the afternoon):
    checkWindow.start = shift.start + shift.requiredDailyMinutes / 2
    requiredMinutesForLadder = shift.requiredDailyMinutes / 2
```

`lateMinutes`, `earlyMinutes`, `isShortDay` and `deductionFor` all read from
`checkWindow.start` and `requiredMinutesForLadder` rather than the shift's raw
fields on a half-day date. A **full**-day `LEAVE` (`amount: 1`) skips the ladder
entirely — there is no worked half to check, and `BR-11` is the complete answer.

Any resulting `AUTOMATIC_DEDUCTION` posts **alongside** the day's
`LEAVE_AVAILED` entry — both are real, independent movements. This is a genuine
behaviour decision, worth a MVP-criterion-5-style hand-calculation check in
Phase 7.

*If overruled:* delete the `checkWindow`/`requiredMinutesForLadder`
substitution in `punctuality.js` and make the caller skip the ladder whenever
`dayRecord.computed.dayStatus === 'LEAVE'`, full or half. One function, one call
site.

### D-12 · Entitlement crediting piggybacks on recalculation, not a scheduled task

Ahmar's decision. No cron or queue infrastructure exists in this app (`D-2`
already rejected a queue for day recalculation on the same reasoning), so a
returning employee's next leave-year `ENTITLEMENT_CREDIT` is not something a
scheduled job posts.

**Decision:** before `recalculateDays` iterates a date range for a user, it
works out which leave year(s) the range touches, and for each such year ensures
**every leave type in that team's `teamPolicy.leaveTypes`** has its
`ENTITLEMENT_CREDIT` posted — idempotent via the existing `effectKey` mechanism
(`utils/ledgerKey.js`), prorated per §20.2 when a tenure starts mid-year. The
same guard runs from the balance-read path (`S-13`, `S-14`'s loaders), so a
year's entitlements credit themselves the first time anything looks at a date
inside it, whichever comes first.

*If overruled:* the guard is one function,
`ensureEntitlementCredited(userId, leaveYear)`, called from two places. Moving
it behind a real scheduled task means adding the trigger and removing the two
call sites — the crediting logic itself (§20.1, §20.2) does not change.

### D-13 · A new ledger entry type for work-from-home usage

`FR-5.5`'s WFH balance needs a movement type to debit and `LEDGER_ENTRY_TYPE`
does not have one. Adding `WFH_USED`.

Modelled as a plain count against the per-team quota (`BR-16`) — **no**
`ENTITLEMENT_CREDIT` for it, because a quota is a ceiling, not a pool drawn down
from a deposit. Replayed the same way every other entry is
(`replayBalance(userId, 'WFH', asOfDate)` with `WFH` used as the pseudo leave
type), so usage stays traceable on `S-14` (`NFR-11`) rather than becoming a
special case computed by counting day-record statuses directly.

### D-14 · `leaveDeductionLadder`'s did-not-attend row gets an explicit flag

`ctoApplicationLadder`'s last seed row already carries `didNotAttend: true`;
`leaveDeductionLadder`'s does not — it is currently a zero-width
`clockedFrom: 0, clockedTo: 0` band, which `deductionFor` would have to treat
specially to avoid it being reached by ordinary band matching (`clockedPercent`
for someone who did not attend is also `0`, which a naive `[0, 33)` band search
would swallow into the wrong row). One convention, not two.

**Decision:** add `didNotAttend: true` to that seed row in the same commit that
writes `ladders.js`. `deductionFor` checks the `attended` argument first and
returns the flagged row directly, never reaching the band search — matching
`ARCHITECTURE.md` §18.1's pseudocode exactly. `CLAUDE.md`'s "clean as you go."

### D-15 · Day records are created lazily, event-triggered

Ahmar's decision: storage optimisation for this is explicitly out of scope this
phase and can be revisited later without a schema change.

A day record is created or updated the first time something touches that date:
a punch lands, a leave record is written, an override is applied, or
`OFFICE_ADMIN` opens `S-10` for a team and date — which ensures every tracked
member's record for that date exists, `ABSENT` included, in one bounded call
(one team, one date, matching `D-2`'s "synchronous and scoped"). A date nobody
has ever touched has no record; `S-09` and reports exclude it rather than
displaying a materialised `ABSENT`. No proactive backfill exists this phase.

### D-16 · `leaveRecords` is built in Branch 2, not Branch 4

Ahmar's decision, 2026-08-16, amending §1's branch table above.

`P-23` (set day status) offers `LEAVE`, and per `D-9` a leave fact is a genuine
engine input rather than an override. Shipping `S-10`/`S-12` with a status
whose ledger effect arrives two branches later would put a day reading `LEAVE`
beside a balance that disagrees — exactly the drift `I-2` and `DC-4` exist to
prevent.

The `leaveRecords` collection, its single-date write path (`P-26`) and its
`LEAVE_AVAILED` posting therefore land in Branch 2. **Branch 4 keeps** balance
replay, accrual, entitlement crediting (`D-12`), `S-13`, `S-14`, `P-19` and
`P-20`.

*If overruled:* `P-23` drops `LEAVE` from its menu and the collection goes
unused until Branch 4 — nothing else references it except the single lookup
inside `recalculateDays`.

### D-17 · Reconciliation matches on effect, not on source version

`ARCHITECTURE.md` §19.3 puts `sourceVersion` in the `effectKey` so a genuine
correction is not refused by the unique index. It does **not** follow that
reconciliation should treat a version bump as a changed effect. If it did, any
change to a day record — a `lateMinutes` correction leaving the deduction
untouched — would reverse and re-post an identical movement, and `S-14` would
fill with pairs cancelling to nothing. `NFR-11` needs that ledger to stay
readable as the explanation of a number.

**Decision:** `reconcileLedger` matches a desired entry to an existing one on
`(entryType, leaveType, amount)`. An existing entry is reversed only when the
day no longer implies it, or implies it at a different amount. A re-posted
entry carries the current version in its `effectKey`, so the index still
permits the legitimate re-post and still refuses a true double-post.

*If overruled:* add `sourceVersion` to `identity()` in `engine/ledger.js`. One
line, one function.

### D-18 · `recalculateDays` materialises lazily by default

`D-15` says a day record is created the first time something touches the date.
A range recalculation is not by itself such a touch — a policy edit covering a
year must not mint 365 `ABSENT` records per user.

**Decision:** `recalculateDays(userId, dateRange, options)` refreshes only
dates that **already have a day record**, or that carry a live punch or leave
record. `options.materialiseUsers` opts a bounded set of users into creating
the record for an untouched date, which is what `S-10` passes when an
`OFFICE_ADMIN` opens one team on one date (`D-15`'s one bounded call).

An open-ended range resolves its bounds from that user's recorded activity
rather than from the clock, so a re-run over a past period stays deterministic
(`NFR-8`).

*If overruled:* remove the filter in `datesToVisit`. Every date in range then
materialises, and `D-15` is what changes with it.

### D-19 · `S-09` shows no PTO balance until the ledger replays

`list-of-screens.md` lists a PTO balance column on `S-09`. A PTO balance is
`approved awards − PTO taken − CTO applications − expiries` replayed from the
ledger (`BR-14`), and none of those entry types exists before Branch 4.

**Decision:** the column states that balances arrive with the ledger's read
surface rather than showing a figure. A zero would be a number, and a wrong
one — `DC-6` forbids presenting a gap as a value.

*If overruled:* drop the column until Branch 4 and add it there.

---

## 3 · `recalculateDays`, filled in (`ARCHITECTURE.md` §23.3)

Per date, per user, within the employment period:

1. Resolve the team and shift held **on that date** (`teamAssignments`,
   `shiftAssignments`).
2. Load punches whose work date is this date; recompute work dates if the
   shift assignment changed (§13).
3. `pairPunches` → `workedMinutes`, punch-level exceptions (§14).
4. `resolveDayType` (§15).
5. Load the `leaveRecords` entry for this date, if any → `authorisedLeave`.
6. `resolveDayStatus` (§16, `D-9`'s input wired in).
7. Lateness, early departure, short day — half-day-aware per `D-11`.
8. `deductionFor`, skipped entirely on a full-day `LEAVE` (§18, `D-11`).
9. Work out this day's desired ledger entries: `AUTOMATIC_DEDUCTION`,
   `LEAVE_AVAILED`, `WFH_USED` (`D-13`) as applicable.
10. Reconcile against existing entries sourced from this day record — post what
    is newly implied, reverse what is no longer implied (§19.3, §23.3 step 9).
11. Upsert the day record; bump `version` and audit **only if something
    changed** (§19.3's requirement, so a re-run mints no fresh `effectKey`).

Before step 1, once per call: ensure the leave year(s) the range touches for
this user are entitlement-credited (`D-12`).

**Explicitly not built this phase:** step 9 of `ARCHITECTURE.md` §12's pipeline
and step 10 of §23.3 — proposing PTO/CTO candidates. `§21` and `§22` are `P6`
in full; `recalculateDays` does not call anything from them.

---

## 4 · Scope boundaries

Named here so they are not mistaken for omissions.

| Deferred | To | Why |
| -------- | -- | --- |
| PTO/CTO proposal, `ladders.js`'s `proposePtoAward`/`proposeCtoApplication` | Phase 6 | `ARCHITECTURE.md` §21, §22 are `P6` in full — approval workflows, not calculations |
| `S-05` exceptions dashboard | Phase 6 | Its data source starts now: `dayRecord.exceptions` is written from Branch 2 onward (`FR-3.12`, `FR-4.7`, `FR-4.8`), same as Phase 4 wrote `policyCompleteness` for Phase 6 to consume |
| `P-07` resolve duplicate punch | Phase 6 | Reached only from `S-05` (§32.1's split table) |
| Leave date-range entry | Not scoped, not scheduled | `D-10` |
| Proactive day-record backfill | Not scoped, not scheduled | `D-15` |
| `FR-2.11` employment-period reduction approval | Phase 6 | Unchanged from `ARCHITECTURE.md` §28 |

---

## 5 · Definition of done

`ARCHITECTURE.md` §33 in full, per branch. Three items specific to this phase,
most easily missed:

- Every worked example in §13.4, §14.3, §18.3–§18.5 exists as a literal test
  case with the same numbers, not a paraphrase.
- `recalculateDays` run twice on the same range produces the same ledger state
  the second time — zero new entries, zero version bumps (`I-9`, `NFR-15`).
- A day carrying an `OFFICE_ADMIN` override survives a recalculation with the
  override intact and the computed value refreshed (`FR-6.12`, `I-6`) — an
  explicit test, not an inference from the others passing.

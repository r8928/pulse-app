# Phase 4 · Basic — design

**What Phase 4 contains** is already written down: `ARCHITECTURE.md` §32.1 is the
canonical membership list, `list-of-screens.md` states each screen's access,
columns, behaviour and states, and `spec.md` §3 holds the requirements. None of
that is repeated here.

**This document records only what those three leave open**, plus the decisions
taken with the supervisor on 2026-08-13. Where it disagrees with `spec.md`,
`spec.md` wins and this document is wrong.

---

## 1 · Delivery

Four branches, in dependency order. Each is squash-merged to `main` and run by
the supervisor before the next starts (`CLAUDE.md`: major tasks on a branch,
`npm test` and `npm run build` green before merge).

| # | Branch | Contains | Why here |
| - | ------ | -------- | -------- |
| 1 | `phase-4-m7-config-access` | `S-18` `S-19`, `P-40`–`P-42` | No dependencies at all (§29) |
| 2 | `phase-4-m6-org-policy` | `S-16` `S-17`, `P-28`–`P-39`, the §2 identity correction | Phase 5's engine cannot resolve a work date without it |
| 3 | `phase-4-m3-people` | `S-07` tabs, `S-08`, `P-09`–`P-14`, `P-17`, `P-18` | Needs teams and shifts from branch 2 |
| 4 | `phase-4-m9-audit-shell` | `S-22`, `P-44`, `P-45`, mobile drawer | Reads what the first three wrote |

Per branch: contract tests first (`CLAUDE.md`, §9.3), `README.md`'s feature
table updated before implementing, and `ARCHITECTURE.md` corrected in the same
change wherever the build proves it wrong (§34).

---

## 2 · Team and shift identity — a correction, not a feature

**The defect.** `scripts/seed.js` writes teams keyed on a natural `key` string
and stamps demo users with `teamKey`. Every consumer reads `user.teamId`:
`userInputSchema` and `listUsers` in `database.js`, `getSessionUser` in
`session.js`, and `recordInScope` in `authz/check.js`. No user therefore has a
`teamId` at all, so `TEAM`-scoped grants match no record and the roster's team
filter matches nothing. Both are dead code today.

**The decision.** Teams and shifts carry ordinary `ObjectId` identity, and every
child document references it.

| Collection | Key fields after |
| ---------- | ---------------- |
| `teams` | `_id`, `key`, `name`, `managerId`, `defaultShiftId`, `deletedAt`, `version` |
| `shifts` | `_id`, `teamId`, `key`, `name`, `startTime`, `endTime`, `requiredDailyMinutes`, `graceMinutes`, `timezone`, `deletedAt`, `version` |
| `holidays` | `_id`, `teamId`, `date`, `name`, `type`, `deletedAt`, `version` |
| `weeklyOffPatterns` | `_id`, `teamId`, `daysOfWeek`, `version` |
| `teamPolicy` | `_id`, `teamId`, … (`FR-6.4` per-team list), `version` |
| `users` | `teamId`, `shiftId` — the fields already read everywhere |

`key` survives on `teams` and `shifts` as **the seed's idempotency key only**,
and is `null` for anything an administrator creates. It is never a foreign key.

**Shifts are per team** (`FR-3.3`, explicitly). A shift therefore carries
`teamId`, `S-17`'s Shifts tab owns its lifecycle, and `P-12` offers a user the
shifts of the team they hold.

**Migration.** Dev databases only, so no migration script exists. The seed
resolves keys to ids after upserting teams, stamps `teamId` onto users,
holidays, weekly-off patterns and policy, and `$unset`s the stale `teamKey`.
`npm run seed` alone brings any existing dev database current.

---

## 3 · Decisions taken

### D-4 · `recalculateDays` is a real seam from Phase 4

`engine/recalculate.js` exports `recalculateDays(userId, dateRange)` with its
final signature (§23.3) and today returns `{ recalculated: 0 }`. Phase-4
mutations that will need it — a holiday edit (`BR-15`), a team move
(`FR-3.14`), a shift assignment (`FR-3.6`) — call it for real.

This is safe **because no day record exists before Phase 5**, so the no-op is
the correct answer rather than a swallowed one. Phase 5 fills in one function
body and reopens no route.

*If overruled:* delete the module and the call sites; every caller is a
one-line removal.

### D-5 · A team's manager may be unset, and says so

`FR-3.1` requires exactly one manager per team, but `spec.md` names a manager
for only one seeded team (Marcus Adeyemi, GC). The seed therefore sets GC's
manager and **leaves the other three unset**, which `policyCompleteness` flags
inline on `S-17` and `S-05` queues in Phase 6.

Inventing three managers would dress a guess up as an org fact, which `DC-6`
and `I-5` forbid — and it would hide the missing-configuration path until
Phase 6. A fresh seed showing three incompletely configured teams is the
honest state, not a defect.

`teams.managerId` is the single source of truth, written by both `P-28` (team
edit) and `P-10` (role change) through **one** `database.js` function, so
"exactly one manager" holds from either entry point (`FR-1.7`, `FR-3.1`).

### D-6 · `database.js` is tested against a real in-memory MongoDB

**This deviates from `CLAUDE.md` ("mock … databases") and `ARCHITECTURE.md`
§11.2 ("Mock the driver"), with the supervisor's agreement. Both are amended in
the same commit that introduces it.**

Reason: the whole value of a query function is the query. Against a mock, a
wrong filter, a missing `deletedAt: null`, a broken unique index and a failed
version check all pass green — the test asserts only that the driver was
called. `mongodb-memory-server` runs a real engine, so those four failure modes
fail loudly.

Everything else in §11.2 stands unchanged: engine functions stay pure and take
policy as an argument, components are tested in jsdom for state and visibility,
and design tokens are asserted in `app/__tests__/theme.test.js` only.

### D-7 · Missing configuration is one pure function

`utils/policyCompleteness.js` takes a team with its shifts, weekly-off pattern
and policy, and returns `[{ entity, field, why }]`. `S-17` flags each inline in
Phase 4; `S-05` consumes the same function in Phase 6 (`FR-3.13`).

Its first customers are the two values `ARCHITECTURE.md` §8.3 deliberately
leaves unseeded — `midnightCrossingWindowHours` and
`duplicatePunchWindowMinutes` — plus an unset team manager (`D-5`) and an
unconfirmed shift timezone.

### D-8 · A withheld permission is a row, not an absent one

On `S-19`, a cell set to none stores `scope: null` rather than removing the
grant. `resolveScope` already reads that as "holds nothing", the row keeps its
`version` for optimistic concurrency, and the change is auditable with a real
before and after. Deleting the row would destroy a record (`I-1`).

`FR-1.3` is enforced server-side exactly as §29.2 requires: the handler loads
the full grant set, applies the proposed cell in memory, runs `validateGrants`
on the **result**, and rejects `400` with the stated reason. The locked
`OFFICE_ADMIN` column is UI courtesy; the server is the guarantee.

---

## 4 · Scope boundaries

Named here so they are not mistaken for omissions.

| Deferred | To | Why |
| -------- | -- | --- |
| `FR-2.11` employment-period reduction approval, `P-05` | Phase 6 (§32.1) | Nothing can be stranded outside a period yet — no punch, day record or ledger entry exists |
| `S-07` Attendance and Leave/balances tabs | Phase 5 | Their collections are empty until the engine and ledger ship. They stay honestly stubbed |
| Recalculation on a policy, calendar or team-move edit | Phase 5 | `D-4`: the call sites ship now, the body arrives with the engine |
| `S-05` exception queues | Phase 6 | `policyCompleteness` (`D-7`) is written in Phase 4 so Phase 6 consumes it rather than re-deriving it |

`FR-3.14` is tagged `P5` while `P-11` (move team) is `P4`. The split is exactly
the recalculation, so `P-11` ships whole in branch 3 and calls the `D-4` seam.

---

## 5 · Definition of done

`ARCHITECTURE.md` §33 in full, per branch. The three items most easily missed
here, restated:

- Every mutation takes and checks a `version`, and answers `409` with `current`.
- Every mutation writes an audit record in the same handler, with full `before`
  and `after` documents rather than a diff (§4.1).
- No figure from `spec.md` §3.10 appears in a `.js` file outside
  `scripts/seed.js` (`I-3`).

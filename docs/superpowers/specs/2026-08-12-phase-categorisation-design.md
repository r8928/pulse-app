# Phase categorisation — design

**Date:** 2026-08-12
**Scope:** Label the remaining Pulse work as Basic (Phase 4), Intermediate
(Phase 5) or Complex (Phase 6) across `spec.md`, `list-of-screens.md`,
`ARCHITECTURE.md` and `DESIGN.md`. No code changes.

This document records the *decisions and their reasons*. The phase map itself
is canonical in **`ARCHITECTURE.md` §32.1** and is deliberately not repeated
here — a second copy would drift, which is what the `CLAUDE.md` four-surface
rule exists to prevent.

---

## The problem

Four phases remain: 4 basic, 5 intermediate, 6 complex, 7 testing. Nothing in
the documentation said which remaining work belonged to which, and `spec.md`
§2.3 carried a *different* Phase 1–6 numbering — inherited from an earlier
plan — that collided with it. Its "Phase 4" meant `FR-5.x` day classification;
the supervisor's Phase 4 means basic features. Two schemes, same numbers,
opposite meanings.

## Decisions

### C-1 · One numbering, everywhere

`spec.md` §2.3 is rewritten to the supervisor's scheme. The old grouping is not
preserved in a second column: two Phase numbers that disagree on the same row
is worse than no number at all, and git history holds the original.

The phrase "Deferred to Phase 2", which meant post-MVP in a *third* sense, is
reworded to Post-MVP so no reading of it collides with a build phase.

### C-2 · Inline tags plus one canonical map

Each requirement, screen, popup and module heading carries a short tag. One
authoritative map lives in `ARCHITECTURE.md` §32.1, beside the dependency build
order it agrees with.

Inline tags answer "which phase is this?" where you are already reading. The
map answers "what is in Phase 4?" without grepping four files. Neither alone
does both.

**Tags used:**

| Tag | Means |
| --- | ----- |
| `[✔]` | Delivered in Phases 0–3. No remaining work. |
| `[✔+]` | Mechanism built; every later phase extends it to its own entities. |
| `[P4]` | Basic — configuration and lifecycle CRUD. No calculation. |
| `[P5]` | Intermediate — the calculation engine and what it directly feeds. |
| `[P6]` | Complex — multi-step approval workflows and wide aggregation. |
| `[P7]` | Testing — verification, not new surface. |
| `[PM]` | Post-MVP, out of scope for 4–7 (`DC-12`). |

### C-3 · A requirement carries the phase of its *last* remaining piece

Several requirements split across phases: the engine raises an exception in
Phase 5, `S-05` surfaces it in Phase 6. Two rules were available — tag the
earliest phase touched, or the latest.

**Latest wins**, because the question a tag answers while building is "can I
tick this off yet?", not "may I start?". `ARCHITECTURE.md` §32.1 names each
split explicitly so the earlier half is never lost.

### C-4 · Assignment criterion: dependency depth and build complexity

- **Basic** — stores and shows data. No calculation, and nothing beneath it is
  unbuilt. Teams, shifts, calendars, weekly-off patterns, policy, ladder
  *configuration*, access control, employment types, the audit read surface,
  the user-lifecycle remainder.
- **Intermediate** — the engine and the two entities it derives. Work date,
  duration, day type, day status, punctuality, deduction, the ledger, accrual.
  Attendance capture and leave balances sit here because they are the engine's
  read and write surfaces.
- **Complex** — multi-step human approval workflows and wide aggregation.
  PTO/CTO propose-approve-decline, the twelve exception queues, the `FR-2.11`
  employment-period reduction approval, and the report builder.

This is close to `ARCHITECTURE.md` §32's existing dependency order, which is
the point: a phase boundary that cuts across a dependency edge produces work
that has to be thrown away.

## Boundary calls

Five places where the split was not obvious, with the reason it went the way it
did.

1. **`S-08` roster import → P4; `S-11` attendance import → P5.** They share
   Excel parse, preview and atomic-commit machinery. `S-08` creates users and
   needs no engine; `S-11` creates punches and cannot resolve a work date
   without one. Building `S-08` first means the shared import component is
   written in P4 and *reused* in P5, which is the correct direction.

2. **`S-09` attendance overview → P5, not P6.** It aggregates, but
   `ARCHITECTURE.md` §25 groups it with `S-10` and `S-12`, and it is the
   `FR-8.1` read surface that MVP criterion 4 exercises. The heavy paged
   builder `S-20` and the annual summary `S-21` stay in P6.

3. **Exceptions are raised in P5 and queued in P6.** The engine writes
   `dayRecord.exceptions` during recalculation; `S-05` reads them. Under C-3,
   `FR-3.12`, `FR-4.7` and `FR-4.8` therefore tag `[P6]`.

4. **`P-07` resolve duplicate punch → P6, not P5.** It is punch mechanics, but
   `list-of-screens.md` §5 files it under *M-2 exception queue actions* and it
   is reached from `S-05`. Following the document's own grouping keeps
   `FR-4.7`'s tag and its popup's tag consistent.

5. **`FR-3.13` missing configuration → P6.** Flagging an unset value inline on
   `S-17` is P4 work, but the requirement is only satisfied when the value is
   *queued on `S-05` until it is set*, and `DC-6` is explicit that it must be.

## Deliberately not done

**No Phase column on `list-of-screens.md` §6 coverage matrix.** That table maps
requirement → screen. Both sides now carry a tag of their own, so a third copy
of the same fact would be pure drift surface. This was in the approved plan and
is the one item dropped from it, for that reason.

**`README.md` is untouched.** Its "What is built" table tracks delivered state,
not planned phases, and `CLAUDE.md` forbids bloating it with anything that does
not prevent a concrete mistake.

## Verification

The categorisation is documentation only. It is correct when:

1. Every `FR-` row in `spec.md` §3 carries exactly one tag.
2. Every `S-nn` and `P-nn` in `list-of-screens.md` carries exactly one tag.
3. `ARCHITECTURE.md` §32.1 lists the same membership the inline tags imply,
   and names every split from C-3.
4. `npm run lint` exits 0 and `npm test` passes — neither should be affected.

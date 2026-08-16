# Phase 5 Branch 1 · Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure calculation core of Pulse's attendance engine — work
date resolution, duration pairing, day classification, punctuality, and the
leave deduction ladder — as exhaustively tested, database-free functions that
Branch 2 (`phase-5-m4a-attendance-capture`) will orchestrate for real.

**Architecture:** Five new files under `engine/`, each exporting small pure
functions per `ARCHITECTURE.md` §13–§18. No file in this branch imports
`database.js`, `app/`, or `components/` — every function takes fully-resolved
plain-object arguments and returns a value, per §8.2 ("every engine function
takes policy as an argument"). One correction to `scripts/seed.js` (`D-14`).

**Tech Stack:** Plain JavaScript, `date-fns` + `date-fns-tz` for all date/time
arithmetic, Vitest (`node` project) for tests.

## Global Constraints

- Every requirement in this plan traces to `ARCHITECTURE.md` §13–§18 or
  `docs/superpowers/specs/2026-08-13-phase-5-design.md`'s decisions `D-11` and
  `D-14`. Where this plan and those disagree, they win — stop and re-read.
- **No `new Date()` for parsing or arithmetic.** Use `date-fns` (`parseISO`,
  `format`, `getDay`, `addDays`, `subDays`, `addMinutes`, `addMilliseconds`,
  `subMilliseconds`) and `date-fns-tz` (`fromZonedTime`, `toZonedTime`)
  throughout (`CLAUDE.md`).
- **No domain literal outside `constants/index.js`.** Every status, type, or
  exception code string is imported, never typed inline a second time
  (`CLAUDE.md`).
- **Every file in this branch is pure.** No import of `database.js`, `app/`,
  or `components/` from anything under `engine/` in this plan.
- **TDD throughout** (`CLAUDE.md`, `ARCHITECTURE.md` §11.1): write the test,
  run it and see it fail for the right reason, then implement.
- **Every worked example in `ARCHITECTURE.md` §13.4, §14.3, §18.3–§18.5 is a
  literal test case** in this plan, with the same input numbers and the same
  expected output — not a paraphrase (§11.4).
- Commit after every task. `npm run lint` must exit 0 before each commit
  (`CLAUDE.md`) — run `npm run lint:fix` first if it doesn't.

---

### Task 1: `engine/workDate.js` — `shiftWindow`

**Files:**
- Create: `engine/workDate.js`
- Modify: `constants/index.js` (add `EXCEPTION_CODE`)
- Test: `engine/__tests__/workDate.test.js`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces:
  - `EXCEPTION_CODE` — `{ NO_SHIFT_ASSIGNED, PUNCH_OUTSIDE_SHIFT_WINDOW, SHIFT_CONFIGURATION_INCOMPLETE, MISSING_CHECK_IN, MISSING_CHECK_OUT, IMPOSSIBLE_DURATION }`, all `string` values equal to their own key.
  - `shiftWindow(shift, workDate)` → `{ start: Date, end: Date, invalidField: null } | { start: Date|null, end: Date|null, invalidField: 'start'|'end' }`, where `shift = { startTime: 'HH:MM', endTime: 'HH:MM', timezone: string }` and `workDate` is a `'YYYY-MM-DD'` string.

- [ ] **Step 1: Add `EXCEPTION_CODE` to `constants/index.js`**

Open `constants/index.js`. Immediately after the `HOLIDAY_TYPE` block (before the
`// --- Ledger ----` comment), insert:

```js
/**
 * FR-8.6, §27.1: the codes the engine writes into `dayRecord.exceptions`.
 * Written starting Phase 5; read by the S-05 exceptions dashboard in Phase 6
 * (ARCHITECTURE.md §27.2 — derived every recalculation, not accumulated).
 */
export const EXCEPTION_CODE = Object.freeze({
  NO_SHIFT_ASSIGNED: 'NO_SHIFT_ASSIGNED',
  PUNCH_OUTSIDE_SHIFT_WINDOW: 'PUNCH_OUTSIDE_SHIFT_WINDOW',
  SHIFT_CONFIGURATION_INCOMPLETE: 'SHIFT_CONFIGURATION_INCOMPLETE',
  MISSING_CHECK_IN: 'MISSING_CHECK_IN',
  MISSING_CHECK_OUT: 'MISSING_CHECK_OUT',
  IMPOSSIBLE_DURATION: 'IMPOSSIBLE_DURATION',
});
```

- [ ] **Step 2: Write the failing tests**

Create `engine/__tests__/workDate.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { shiftWindow } from '../workDate.js';

const karachiDay = { startTime: '09:00', endTime: '18:00', timezone: 'Asia/Karachi' };
const karachiNight = { startTime: '19:00', endTime: '04:00', timezone: 'Asia/Karachi' };
const pacificNight = { startTime: '19:00', endTime: '04:00', timezone: 'America/Los_Angeles' };

describe('shiftWindow', () => {
  it('resolves an ordinary day shift to same-day UTC instants', () => {
    // Asia/Karachi is UTC+5, no DST.
    const window = shiftWindow(karachiDay, '2026-08-12');
    expect(window.invalidField).toBeNull();
    expect(window.start.toISOString()).toBe('2026-08-12T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-08-12T13:00:00.000Z');
  });

  it('rolls a crossing shift onto the next calendar day (ARCHITECTURE 13.4)', () => {
    const window = shiftWindow(karachiNight, '2026-03-09');
    expect(window.start.toISOString()).toBe('2026-03-09T14:00:00.000Z'); // 2026-03-09 19:00 PKT
    expect(window.end.toISOString()).toBe('2026-03-09T23:00:00.000Z'); // 2026-03-10 04:00 PKT (UTC+5, so still the 9th in UTC)
  });

  it('shrinks a night shift to 8 hours on the US spring-forward night', () => {
    // America/Los_Angeles: clocks spring forward 2026-03-08 02:00 -> 03:00.
    // A shift starting 2026-03-07 19:00 and ending 2026-03-08 04:00 spans
    // that loss, so its real elapsed time is 8h, not the nominal 9h.
    const window = shiftWindow(pacificNight, '2026-03-07');
    const hours = (window.end.getTime() - window.start.getTime()) / 3600000;
    expect(hours).toBe(8);
  });

  it('grows a night shift to 10 hours on the US fall-back night', () => {
    // Clocks fall back 2026-11-01 02:00 -> 01:00. A shift starting
    // 2026-10-31 19:00 and ending 2026-11-01 04:00 spans that repeated
    // hour, so its real elapsed time is 10h, not the nominal 9h.
    const window = shiftWindow(pacificNight, '2026-10-31');
    const hours = (window.end.getTime() - window.start.getTime()) / 3600000;
    expect(hours).toBe(10);
  });

  it('rejects a shift start that falls in the spring-forward gap', () => {
    // 2026-03-08 02:30 America/Los_Angeles never happened.
    const gapShift = { startTime: '02:30', endTime: '11:30', timezone: 'America/Los_Angeles' };
    const window = shiftWindow(gapShift, '2026-03-08');
    expect(window.invalidField).toBe('start');
    expect(window.start).toBeNull();
  });

  it('takes the first occurrence of an ambiguous fall-back local time', () => {
    // 01:30 America/Los_Angeles happens twice on 2026-11-01. The first
    // occurrence is PDT (UTC-7): 08:30Z, not the second (PST, UTC-8): 09:30Z.
    const ambiguousShift = { startTime: '01:30', endTime: '10:00', timezone: 'America/Los_Angeles' };
    const window = shiftWindow(ambiguousShift, '2026-11-01');
    expect(window.start.toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/workDate.test.js`
Expected: FAIL — `shiftWindow` is not exported / `engine/workDate.js` does not exist.

- [ ] **Step 4: Implement `engine/workDate.js`**

```js
import { addDays, format, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * §13.2. Resolves a shift's start and end to absolute UTC instants for one
 * work date, honouring the daylight-saving offset in force on EACH end
 * independently (FR-3.11: a transition day is 23 or 25 hours, not 24 —
 * never computed as `start + requiredDailyMinutes`).
 */

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function crossesMidnight(shift) {
  return shift.endTime <= shift.startTime;
}

/**
 * Resolves one local wall-clock instant to UTC, rejecting a spring-forward
 * time that never happened (§13.3, FR-3.11, invariant I-5).
 *
 * Fall back (ambiguous) is handled correctly by `fromZonedTime` alone: it
 * resolves an ambiguous local time using the PRE-transition offset, which is
 * the FIRST of the two occurrences. Verified against date-fns-tz's own
 * documented example: America/New_York 2014-11-02 01:30 resolves to 05:30
 * UTC (EDT, first), not 06:30 UTC (EST, second). Nothing extra is needed for
 * that direction.
 *
 * Spring forward (nonexistent) is NOT rejected by the library — it silently
 * returns some instant for a local time that never existed. Round-tripping
 * that instant back through `toZonedTime` and comparing is date-fns-tz's own
 * documented pattern for detecting this.
 */
function resolveLocalInstant(localDateTimeString, timezone) {
  const instant = fromZonedTime(localDateTimeString, timezone);
  const roundTrip = format(toZonedTime(instant, timezone), LOCAL_FORMAT);
  return roundTrip === localDateTimeString ? instant : null;
}

/**
 * @param {{ startTime: string, endTime: string, timezone: string }} shift
 * @param {string} workDate 'YYYY-MM-DD'
 * @returns {{ start: Date, end: Date, invalidField: null }
 *         | { start: Date|null, end: Date|null, invalidField: 'start'|'end' }}
 */
export function shiftWindow(shift, workDate) {
  const startLocal = `${workDate}T${shift.startTime}`;
  const endDateStr = crossesMidnight(shift)
    ? format(addDays(parseISO(workDate), 1), 'yyyy-MM-dd')
    : workDate;
  const endLocal = `${endDateStr}T${shift.endTime}`;

  const start = resolveLocalInstant(startLocal, shift.timezone);
  const end = resolveLocalInstant(endLocal, shift.timezone);

  if (start === null) return { start: null, end, invalidField: 'start' };
  if (end === null) return { start, end: null, invalidField: 'end' };
  return { start, end, invalidField: null };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/workDate.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Lint and commit**

Run: `npm run lint` — fix with `npm run lint:fix` if needed, then re-check.

```bash
git checkout -b phase-5-engine-core
git add constants/index.js engine/workDate.js engine/__tests__/workDate.test.js
git commit -m "feat: shift window resolution with DST-correct instants (ARCHITECTURE 13.2)"
```

---

### Task 2: `engine/workDate.js` — `resolveWorkDate`

**Files:**
- Modify: `engine/workDate.js`
- Test: `engine/__tests__/workDate.test.js`

**Interfaces:**
- Consumes: `shiftWindow(shift, workDate)` from Task 1.
- Produces: `resolveWorkDate(punchInstant, shiftAssignments)` →
  `{ workDate: string, exceptionCode: null } | { workDate: null, exceptionCode: string }`,
  where `shiftAssignments` is
  `Array<{ effectiveFrom: string, effectiveTo: string|null, shift: { startTime, endTime, timezone, crossingWindowHours: number|null|undefined } }>`.
  `shift.crossingWindowHours` is the assigned shift's **team's**
  `teamPolicy.midnightCrossingWindowHours` — Branch 2's orchestrator resolves
  and attaches it before calling this function; `resolveWorkDate` never reads
  policy itself (§8.2).

- [ ] **Step 1: Write the failing tests**

Append to `engine/__tests__/workDate.test.js`:

```js
import { resolveWorkDate } from '../workDate.js';

const gcShift = {
  startTime: '19:00',
  endTime: '04:00',
  timezone: 'Asia/Karachi',
  crossingWindowHours: 8,
};

const gcAssignment = {
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  shift: gcShift,
};

describe('resolveWorkDate', () => {
  it('resolves the night-shift worked example exactly (ARCHITECTURE 13.4)', () => {
    // Punch instants below are the local times converted to UTC by hand:
    // 2026-03-09 19:05 PKT = 2026-03-09T14:05:00Z
    // 2026-03-10 02:30 PKT = 2026-03-09T21:30:00Z
    // 2026-03-10 19:30 PKT = 2026-03-10T14:30:00Z
    expect(
      resolveWorkDate(new Date('2026-03-09T14:05:00Z'), [gcAssignment]),
    ).toEqual({ workDate: '2026-03-09', exceptionCode: null });

    expect(
      resolveWorkDate(new Date('2026-03-09T21:30:00Z'), [gcAssignment]),
    ).toEqual({ workDate: '2026-03-09', exceptionCode: null });

    expect(
      resolveWorkDate(new Date('2026-03-10T14:30:00Z'), [gcAssignment]),
    ).toEqual({ workDate: '2026-03-10', exceptionCode: null });
  });

  it('raises NO_SHIFT_ASSIGNED with no covering assignment', () => {
    const result = resolveWorkDate(new Date('2026-03-09T14:05:00Z'), []);
    expect(result).toEqual({ workDate: null, exceptionCode: 'NO_SHIFT_ASSIGNED' });
  });

  it('raises SHIFT_CONFIGURATION_INCOMPLETE when the crossing window is unset (§8.3)', () => {
    const unconfigured = {
      ...gcAssignment,
      shift: { ...gcShift, crossingWindowHours: undefined },
    };
    const result = resolveWorkDate(new Date('2026-03-09T14:05:00Z'), [unconfigured]);
    expect(result).toEqual({
      workDate: null,
      exceptionCode: 'SHIFT_CONFIGURATION_INCOMPLETE',
    });
  });

  it('raises PUNCH_OUTSIDE_SHIFT_WINDOW for a punch far from any shift', () => {
    // An 8h crossing window is generous enough to make every instant of
    // every day reachable from SOME candidate date on this 9h shift (that
    // is why ARCHITECTURE.md's own worked example uses 8h — it makes the
    // three punches unambiguous, not because 8h is realistic). A 1h window
    // is used here specifically so "outside even widened" is reachable: a
    // punch at 12:00 PKT sits in the middle of the 13-hour gap between the
    // previous night's widened end (05:00 PKT) and this night's widened
    // start (18:00 PKT).
    const tightAssignment = {
      ...gcAssignment,
      shift: { ...gcShift, crossingWindowHours: 1 },
    };
    const result = resolveWorkDate(new Date('2026-03-09T07:00:00Z'), [tightAssignment]);
    expect(result).toEqual({
      workDate: null,
      exceptionCode: 'PUNCH_OUTSIDE_SHIFT_WINDOW',
    });
  });

  it('prefers a match that fits the ordinary window over one that only fits widened, when two assignments overlap (§13.1)', () => {
    const dayShift = {
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'Asia/Karachi',
      crossingWindowHours: 8,
    };
    const oldAssignment = {
      effectiveFrom: '2025-01-01',
      effectiveTo: '2026-03-09',
      shift: gcShift, // night shift, ends 2026-03-09
    };
    const newAssignment = {
      effectiveFrom: '2026-03-10',
      effectiveTo: null,
      shift: dayShift, // day shift, starts 2026-03-10
    };

    // A punch at 2026-03-10 10:00 PKT (05:00Z) is genuinely ambiguous: it
    // fits inside the OLD night shift's window only via the widened crossing
    // buffer (the raw window ends 04:00 the same morning), AND it fits
    // inside the NEW day shift's ordinary, unwidened window. The ordinary
    // match wins.
    const result = resolveWorkDate(new Date('2026-03-10T05:00:00Z'), [
      oldAssignment,
      newAssignment,
    ]);
    expect(result).toEqual({ workDate: '2026-03-10', exceptionCode: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/workDate.test.js`
Expected: FAIL — `resolveWorkDate` is not exported.

- [ ] **Step 3: Implement `resolveWorkDate`**

First, replace `engine/workDate.js`'s import block (currently just
`date-fns` and `date-fns-tz` imports from Task 1) with:

```js
import { addDays, addMilliseconds, format, parseISO, subDays, subMilliseconds } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { EXCEPTION_CODE } from '../constants/index.js';
```

Then append below the existing `shiftWindow` function (keep `crossesMidnight`
and `resolveLocalInstant` as they are):

```js
const HOUR_MS = 3600000;
const CANDIDATE_SPAN_HOURS = 48;

function localDateIn(instant, timezone) {
  return format(toZonedTime(instant, timezone), 'yyyy-MM-dd');
}

/**
 * §13.1. Resolves which work date a punch belongs to by searching, not
 * assuming: the shift needed to answer the question is itself what the
 * question is about. `shiftAssignments` may be a user's whole history (or
 * any superset covering the punch) — filtering to the plausible window is
 * this function's job, not the caller's.
 *
 * @param {Date} punchInstant
 * @param {Array<{ effectiveFrom: string, effectiveTo: string|null, shift: object }>} shiftAssignments
 * @returns {{ workDate: string, exceptionCode: null } | { workDate: null, exceptionCode: string }}
 */
export function resolveWorkDate(punchInstant, shiftAssignments) {
  const spanStart = subMilliseconds(punchInstant, CANDIDATE_SPAN_HOURS * HOUR_MS);
  const spanEnd = addMilliseconds(punchInstant, CANDIDATE_SPAN_HOURS * HOUR_MS);

  const candidates = shiftAssignments.filter((assignment) => {
    const from = parseISO(assignment.effectiveFrom);
    const to = assignment.effectiveTo ? parseISO(assignment.effectiveTo) : null;
    return from <= spanEnd && (to === null || to >= spanStart);
  });

  if (candidates.length === 0) {
    return { workDate: null, exceptionCode: EXCEPTION_CODE.NO_SHIFT_ASSIGNED };
  }

  let anyConfigured = false;
  const matches = [];

  for (const assignment of candidates) {
    const { shift } = assignment;
    if (shift.crossingWindowHours === null || shift.crossingWindowHours === undefined) {
      continue; // §8.3: unconfigured — this candidate's window cannot be searched at all
    }
    anyConfigured = true;

    const sameDay = localDateIn(punchInstant, shift.timezone);
    const dayBefore = format(subDays(parseISO(sameDay), 1), 'yyyy-MM-dd');

    for (const workDate of [sameDay, dayBefore]) {
      const { start, end, invalidField } = shiftWindow(shift, workDate);
      if (invalidField) continue;

      const inRaw = punchInstant >= start && punchInstant <= end;

      const crossingMs = shift.crossingWindowHours * HOUR_MS;
      const widenedStart = subMilliseconds(start, crossingMs);
      const widenedEnd = addMilliseconds(end, crossingMs);
      const inWidened = punchInstant >= widenedStart && punchInstant <= widenedEnd;

      if (inRaw || inWidened) {
        matches.push({ assignment, workDate, widened: !inRaw });
      }
    }
  }

  if (matches.length === 0) {
    return {
      workDate: null,
      exceptionCode: anyConfigured
        ? EXCEPTION_CODE.PUNCH_OUTSIDE_SHIFT_WINDOW
        : EXCEPTION_CODE.SHIFT_CONFIGURATION_INCOMPLETE,
    };
  }

  // §13.1: on the day an assignment changes, more than one candidate can
  // match — and because the crossing buffer widens generously in both
  // directions, one of the two matches is often only reachable through that
  // buffer while the other fits the shift's ordinary window outright. A
  // match that needed no widening is the stronger signal, so it wins first;
  // only among ties does the algorithm's stated tie-break apply — prefer
  // whichever assignment's own effective range covers the date it resolved
  // to.
  const isWidened = (match) => match.widened;
  const tightMatches = matches.filter((match) => !isWidened(match));
  const bestMatches = tightMatches.length > 0 ? tightMatches : matches;

  const covering = bestMatches.find(({ assignment, workDate }) => {
    const from = assignment.effectiveFrom;
    const to = assignment.effectiveTo;
    return from <= workDate && (to === null || to >= workDate);
  });

  return { workDate: (covering ?? bestMatches[0]).workDate, exceptionCode: null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/workDate.test.js`
Expected: PASS, all 11 tests (6 from Task 1 + 5 new).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/workDate.js engine/__tests__/workDate.test.js
git commit -m "feat: resolve a punch's work date by searching shift windows (ARCHITECTURE 13.1)"
```

---

### Task 3: `engine/duration.js` — `flagDuplicates`

**Files:**
- Create: `engine/duration.js`
- Test: `engine/__tests__/duration.test.js`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces: `flagDuplicates(punchesOnWorkDate, windowMinutes)` → `Set<string>`
  of punch `_id`s that are duplicates, where
  `punchesOnWorkDate: Array<{ _id: string, type: 'CHECK_IN'|'CHECK_OUT', at: Date }>`.

- [ ] **Step 1: Write the failing tests**

Create `engine/__tests__/duration.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { flagDuplicates } from '../duration.js';

const punch = (id, type, at) => ({ _id: id, type, at: new Date(at) });

describe('flagDuplicates', () => {
  it('flags a second check-in inside the window as a duplicate of the first', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:05:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set(['b']));
  });

  it('does not flag punches outside the window', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:15:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set());
  });

  it('does not compare punches of different types', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_OUT', '2026-08-12T09:02:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set());
  });

  it('flags every close punch of a run against the first, not a rolling chain', () => {
    const punches = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:05:00Z'),
      punch('c', 'CHECK_IN', '2026-08-12T09:10:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set(['b', 'c']));
  });

  it('is insensitive to input order', () => {
    const punches = [
      punch('b', 'CHECK_IN', '2026-08-12T09:05:00Z'),
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00Z'),
    ];
    expect(flagDuplicates(punches, 10)).toEqual(new Set(['b']));
  });

  it('treats a zero-minute window as flagging only exact-instant repeats', () => {
    const sameInstant = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00.000Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:00:00.000Z'),
    ];
    expect(flagDuplicates(sameInstant, 0)).toEqual(new Set(['b']));

    const oneSecondApart = [
      punch('a', 'CHECK_IN', '2026-08-12T09:00:00.000Z'),
      punch('b', 'CHECK_IN', '2026-08-12T09:00:01.000Z'),
    ];
    expect(flagDuplicates(oneSecondApart, 0)).toEqual(new Set());
  });

  it('returns an empty set for no punches', () => {
    expect(flagDuplicates([], 10)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/duration.test.js`
Expected: FAIL — `engine/duration.js` does not exist.

- [ ] **Step 3: Implement `flagDuplicates`**

Create `engine/duration.js`:

```js
/**
 * FR-4.7, §14.1/§14.2. Flags punches of the same type, same user, same work
 * date, within `windowMinutes` of an earlier one of the same type as
 * duplicates — excluded from pairing, never deleted (invariant I-1).
 *
 * Pure: returns the set of punch ids to treat as duplicates. The caller
 * persists `isDuplicate` on the punch documents; nothing here mutates input.
 * `windowMinutes` is that team's `teamPolicy.duplicatePunchWindowMinutes`.
 *
 * @param {Array<{ _id: string, type: string, at: Date }>} punchesOnWorkDate
 * @param {number} windowMinutes
 * @returns {Set<string>} ids of the punches that are duplicates
 */
export function flagDuplicates(punchesOnWorkDate, windowMinutes) {
  const duplicates = new Set();
  const lastSeenOfType = new Map();
  const windowMs = windowMinutes * 60000;

  const sorted = [...punchesOnWorkDate].sort((a, b) => a.at - b.at);

  for (const punch of sorted) {
    const anchor = lastSeenOfType.get(punch.type);

    if (anchor && punch.at.getTime() - anchor.at.getTime() <= windowMs) {
      duplicates.add(punch._id);
      // The anchor stays as the first of the run, so a third close punch
      // compares against the first, not the second.
    } else {
      lastSeenOfType.set(punch.type, punch);
    }
  }

  return duplicates;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/duration.test.js`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/duration.js engine/__tests__/duration.test.js
git commit -m "feat: flag duplicate punches within a team's configured window (FR-4.7)"
```

---

### Task 4: `engine/duration.js` — `pairPunches`, `workedMinutes`, `impossibleDurationExceptions`

**Files:**
- Modify: `engine/duration.js`
- Modify: `constants/index.js` (add `PUNCH_TYPE` is already present — no change needed there; this task only consumes it)
- Test: `engine/__tests__/duration.test.js`

**Interfaces:**
- Consumes: `EXCEPTION_CODE` (Task 1), `PUNCH_TYPE` (already in `constants/index.js`).
- Produces:
  - `pairPunches(punches)` → `{ pairs: Array<[Punch, Punch]>, exceptions: string[], livePunches: Punch[] }`, where `Punch = { _id, type, at: Date, deletedAt: Date|null, isDuplicate: boolean }`.
  - `workedMinutes(pairs)` → `number`.
  - `impossibleDurationExceptions(pairs)` → `string[]`.

- [ ] **Step 1: Write the failing tests**

Append to `engine/__tests__/duration.test.js`:

```js
import { impossibleDurationExceptions, pairPunches, workedMinutes } from '../duration.js';

const live = (id, type, at) => ({
  _id: id,
  type,
  at: new Date(at),
  deletedAt: null,
  isDuplicate: false,
});

describe('pairPunches', () => {
  it('pairs the two-pair worked example exactly (ARCHITECTURE 14.3)', () => {
    const punches = [
      live('1', 'CHECK_IN', '2026-08-12T09:02:00Z'),
      live('2', 'CHECK_OUT', '2026-08-12T13:00:00Z'),
      live('3', 'CHECK_IN', '2026-08-12T13:45:00Z'),
      live('4', 'CHECK_OUT', '2026-08-12T18:04:00Z'),
    ];
    const { pairs, exceptions } = pairPunches(punches);
    expect(pairs).toHaveLength(2);
    expect(exceptions).toEqual([]);
    expect(workedMinutes(pairs)).toBe(497);
  });

  it('flags a lone check-in as MISSING_CHECK_OUT and pairs nothing', () => {
    const { pairs, exceptions } = pairPunches([
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
    ]);
    expect(pairs).toEqual([]);
    expect(exceptions).toEqual(['MISSING_CHECK_OUT']);
  });

  it('flags a lone check-out as MISSING_CHECK_IN', () => {
    const { exceptions } = pairPunches([
      live('1', 'CHECK_OUT', '2026-08-12T09:00:00Z'),
    ]);
    expect(exceptions).toEqual(['MISSING_CHECK_IN']);
  });

  it('flags an unclosed check-in when a second one follows', () => {
    const punches = [
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      live('2', 'CHECK_IN', '2026-08-12T09:10:00Z'),
      live('3', 'CHECK_OUT', '2026-08-12T17:00:00Z'),
    ];
    const { pairs, exceptions } = pairPunches(punches);
    expect(exceptions).toEqual(['MISSING_CHECK_OUT']);
    expect(pairs).toEqual([[punches[1], punches[2]]]);
  });

  it('excludes soft-deleted and duplicate-flagged punches from pairing', () => {
    const punches = [
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
      { ...live('2', 'CHECK_IN', '2026-08-12T09:05:00Z'), isDuplicate: true },
      { ...live('3', 'CHECK_OUT', '2026-08-12T17:00:00Z'), deletedAt: new Date() },
      live('4', 'CHECK_OUT', '2026-08-12T17:05:00Z'),
    ];
    const { pairs, exceptions, livePunches } = pairPunches(punches);
    expect(livePunches.map((p) => p._id)).toEqual(['1', '4']);
    expect(pairs).toHaveLength(1);
    expect(exceptions).toEqual([]);
  });

  it('sorts out-of-order input before pairing', () => {
    const punches = [
      live('2', 'CHECK_OUT', '2026-08-12T17:00:00Z'),
      live('1', 'CHECK_IN', '2026-08-12T09:00:00Z'),
    ];
    const { pairs } = pairPunches(punches);
    expect(pairs[0][0]._id).toBe('1');
    expect(pairs[0][1]._id).toBe('2');
  });
});

describe('impossibleDurationExceptions', () => {
  it('flags a pair totalling more than 24 hours', () => {
    const pairs = [[
      { at: new Date('2026-08-12T00:00:00Z') },
      { at: new Date('2026-08-13T01:00:00Z') },
    ]];
    expect(impossibleDurationExceptions(pairs)).toEqual(['IMPOSSIBLE_DURATION']);
  });

  it('flags a check-out earlier than its check-in, and workedMinutes does not go negative', () => {
    const pairs = [[
      { at: new Date('2026-08-12T09:00:00Z') },
      { at: new Date('2026-08-12T08:00:00Z') },
    ]];
    expect(impossibleDurationExceptions(pairs)).toEqual(['IMPOSSIBLE_DURATION']);
    expect(workedMinutes(pairs)).toBe(0);
  });

  it('flags nothing for an ordinary pair', () => {
    const pairs = [[
      { at: new Date('2026-08-12T09:00:00Z') },
      { at: new Date('2026-08-12T17:00:00Z') },
    ]];
    expect(impossibleDurationExceptions(pairs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/duration.test.js`
Expected: FAIL — `pairPunches`, `workedMinutes`, `impossibleDurationExceptions` are not exported.

- [ ] **Step 3: Implement the three functions**

Add to the top of `engine/duration.js`:

```js
import { EXCEPTION_CODE, PUNCH_TYPE } from '../constants/index.js';
```

Append to `engine/duration.js`:

```js
/**
 * §14.1. Pairs check-ins with check-outs on one work date, for one user.
 * Live punches only — not soft deleted, not flagged duplicate (FR-4.7).
 *
 * A missing counterpart is never treated as zero hours (FR-4.8, invariant
 * I-5): it becomes an exception and the day keeps whatever complete pairs
 * exist.
 *
 * @param {Array<{ _id, type, at: Date, deletedAt: Date|null, isDuplicate: boolean }>} punches
 * @returns {{ pairs: Array, exceptions: string[], livePunches: Array }}
 */
export function pairPunches(punches) {
  const livePunches = punches
    .filter((punch) => !punch.deletedAt && !punch.isDuplicate)
    .sort((a, b) => a.at - b.at);

  const pairs = [];
  const exceptions = [];
  let open = null;

  for (const punch of livePunches) {
    if (punch.type === PUNCH_TYPE.CHECK_IN) {
      if (open !== null) exceptions.push(EXCEPTION_CODE.MISSING_CHECK_OUT);
      open = punch;
    } else {
      if (open === null) {
        exceptions.push(EXCEPTION_CODE.MISSING_CHECK_IN);
      } else {
        pairs.push([open, punch]);
        open = null;
      }
    }
  }

  if (open !== null) exceptions.push(EXCEPTION_CODE.MISSING_CHECK_OUT);

  return { pairs, exceptions, livePunches };
}

/**
 * §14. The sum of all check-in to check-out intervals, in minutes. A pair
 * with a check-out earlier than its check-in contributes zero rather than a
 * negative number — `impossibleDurationExceptions` is what flags it.
 *
 * @param {Array<[{at: Date}, {at: Date}]>} pairs
 * @returns {number}
 */
export function workedMinutes(pairs) {
  return pairs.reduce((total, [inPunch, outPunch]) => {
    const minutes = (outPunch.at.getTime() - inPunch.at.getTime()) / 60000;
    return total + Math.max(0, minutes);
  }, 0);
}

/**
 * §14.2. An impossible duration: over 24 hours total, or any pair whose
 * check-out precedes the check-in it closes. `pairPunches` pairs mechanically
 * by type and order and does not itself judge validity — this is that
 * judgement, queued on S-05 in Phase 6 (FR-8.6).
 *
 * @param {Array<[{at: Date}, {at: Date}]>} pairs
 * @returns {string[]}
 */
export function impossibleDurationExceptions(pairs) {
  const hasBackwardsPair = pairs.some(([inPunch, outPunch]) => outPunch.at < inPunch.at);
  if (hasBackwardsPair) return [EXCEPTION_CODE.IMPOSSIBLE_DURATION];

  if (workedMinutes(pairs) > 24 * 60) return [EXCEPTION_CODE.IMPOSSIBLE_DURATION];

  return [];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/duration.test.js`
Expected: PASS, all 16 tests (7 from Task 3 + 9 new).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/duration.js engine/__tests__/duration.test.js
git commit -m "feat: pair punches into worked duration, flagging missing and impossible ones (ARCHITECTURE 14)"
```

---

### Task 5: `engine/classify.js` — `resolveDayType`

**Files:**
- Create: `engine/classify.js`
- Test: `engine/__tests__/classify.test.js`

**Interfaces:**
- Consumes: `DAY_TYPE` (already in `constants/index.js`).
- Produces: `resolveDayType(date, holidays, weeklyOffPattern)` → one of
  `DAY_TYPE`'s values, where `date` is `'YYYY-MM-DD'`,
  `holidays: Array<{ date: string, deletedAt: Date|null }>`,
  `weeklyOffPattern: { daysOfWeek: number[] } | null`.

- [ ] **Step 1: Write the failing tests**

Create `engine/__tests__/classify.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { resolveDayType } from '../classify.js';

describe('resolveDayType', () => {
  it('returns HOLIDAY for a date on the team calendar', () => {
    const holidays = [{ date: '2026-03-23', deletedAt: null }];
    expect(resolveDayType('2026-03-23', holidays, { daysOfWeek: [] })).toBe('HOLIDAY');
  });

  it('ignores a soft-deleted holiday entry', () => {
    const holidays = [{ date: '2026-03-23', deletedAt: new Date() }];
    expect(resolveDayType('2026-03-23', holidays, { daysOfWeek: [] })).toBe('WORKING');
  });

  it('returns WEEKLY_OFF for a day matching the pattern', () => {
    // 2026-08-15 is a Saturday (getDay() === 6).
    expect(resolveDayType('2026-08-15', [], { daysOfWeek: [6, 0] })).toBe('WEEKLY_OFF');
  });

  it('returns WORKING for an ordinary weekday with no holiday', () => {
    // 2026-08-12 is a Wednesday.
    expect(resolveDayType('2026-08-12', [], { daysOfWeek: [6, 0] })).toBe('WORKING');
  });

  it('prefers HOLIDAY when a date is both a holiday and a weekly off (§15 documented decision)', () => {
    const holidays = [{ date: '2026-08-15', deletedAt: null }]; // a Saturday
    expect(resolveDayType('2026-08-15', holidays, { daysOfWeek: [6, 0] })).toBe('HOLIDAY');
  });

  it('treats a team with no weekly-off pattern set as never weekly-off', () => {
    expect(resolveDayType('2026-08-15', [], null)).toBe('WORKING');
  });

  it('supports a non-weekend pattern (FR-3.8, the Sales & Marketing seed)', () => {
    // 2026-08-14 is a Friday; Sales & Marketing's pattern is [0, 6] Sun/Sat,
    // so Friday is WORKING for them but WEEKLY_OFF for a team off Fri/Sat.
    expect(resolveDayType('2026-08-14', [], { daysOfWeek: [0, 6] })).toBe('WORKING');
    expect(resolveDayType('2026-08-14', [], { daysOfWeek: [5, 6] })).toBe('WEEKLY_OFF');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/classify.test.js`
Expected: FAIL — `engine/classify.js` does not exist.

- [ ] **Step 3: Implement `resolveDayType`**

Create `engine/classify.js`:

```js
import { getDay, parseISO } from 'date-fns';
import { DAY_TYPE } from '../constants/index.js';

/**
 * §15. A fact about the date for the team held on it, not about the person —
 * no override exists for this value (FR-5.9). Comes first because §16's
 * status rules branch on it.
 *
 * A date that is both a holiday and the weekly-off pattern resolves HOLIDAY:
 * it was explicitly entered for this team, while weekly off is a standing
 * pattern. This affects only the label — both are non-working, so §16
 * treats them identically for status.
 *
 * @param {string} date 'YYYY-MM-DD'
 * @param {Array<{ date: string, deletedAt: Date|null }>} holidays this team's calendar
 * @param {{ daysOfWeek: number[] } | null} weeklyOffPattern
 * @returns {string} one of DAY_TYPE's values
 */
export function resolveDayType(date, holidays, weeklyOffPattern) {
  const isHoliday = holidays.some((holiday) => holiday.date === date && !holiday.deletedAt);
  if (isHoliday) return DAY_TYPE.HOLIDAY;

  // date-fns getDay: 0 = Sunday .. 6 = Saturday, the same convention
  // weeklyOffPatternSchema documents (database.js).
  const dayOfWeek = getDay(parseISO(date));
  if (weeklyOffPattern?.daysOfWeek?.includes(dayOfWeek)) {
    return DAY_TYPE.WEEKLY_OFF;
  }

  return DAY_TYPE.WORKING;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/classify.test.js`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/classify.js engine/__tests__/classify.test.js
git commit -m "feat: resolve a date's day type from the team calendar and weekly-off pattern (ARCHITECTURE 15)"
```

---

### Task 6: `engine/classify.js` — `resolveDayStatus`

**Files:**
- Modify: `engine/classify.js`
- Test: `engine/__tests__/classify.test.js`

**Interfaces:**
- Consumes: `DAY_STATUS`, `DAY_TYPE` (already in `constants/index.js`).
- Produces: `resolveDayStatus({ dayType, override, authorisedLeave, punches })`
  → one of `DAY_STATUS`'s values, where `override: { dayStatus: string } | null`,
  `authorisedLeave: object | null` (truthy iff a leave record covers the
  date — Branch 4 gives this its real shape; this function only checks
  truthiness), `punches: Array` (the **live** punch list — `pairPunches`'s
  `livePunches`, not its `pairs` — so a checked-in-but-not-out day still
  counts as present).

- [ ] **Step 1: Write the failing tests**

Append to `engine/__tests__/classify.test.js`:

```js
import { resolveDayStatus } from '../classify.js';

describe('resolveDayStatus', () => {
  it('returns the override first, ahead of everything else', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: { dayStatus: 'WFH' },
      authorisedLeave: { leaveType: 'Casual' },
      punches: [],
    });
    expect(status).toBe('WFH');
  });

  it('returns LEAVE when authorised, ahead of what punches show (§16.2 worked example)', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: null,
      authorisedLeave: { leaveType: 'Sick', amount: 1 },
      punches: [{ _id: '1' }], // punched in at 09:02, per the worked example
    });
    expect(status).toBe('LEAVE');
  });

  it('returns HOLIDAY_WORK for any punches at all on a non-working day, however few', () => {
    const status = resolveDayStatus({
      dayType: 'HOLIDAY',
      override: null,
      authorisedLeave: null,
      punches: [{ _id: '1' }],
    });
    expect(status).toBe('HOLIDAY_WORK');
  });

  it('returns HOLIDAY for an untouched holiday', () => {
    const status = resolveDayStatus({
      dayType: 'HOLIDAY',
      override: null,
      authorisedLeave: null,
      punches: [],
    });
    expect(status).toBe('HOLIDAY');
  });

  it('returns WEEKLY_OFF for an untouched weekly-off day', () => {
    const status = resolveDayStatus({
      dayType: 'WEEKLY_OFF',
      override: null,
      authorisedLeave: null,
      punches: [],
    });
    expect(status).toBe('WEEKLY_OFF');
  });

  it('returns WFO for a working day with punches', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: null,
      authorisedLeave: null,
      punches: [{ _id: '1' }],
    });
    expect(status).toBe('WFO');
  });

  it('returns ABSENT for a working day with no punches, no leave, no override', () => {
    const status = resolveDayStatus({
      dayType: 'WORKING',
      override: null,
      authorisedLeave: null,
      punches: [],
    });
    expect(status).toBe('ABSENT');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/classify.test.js`
Expected: FAIL — `resolveDayStatus` is not exported.

- [ ] **Step 3: Implement `resolveDayStatus`**

Add `DAY_STATUS` to the existing import line in `engine/classify.js`:

```js
import { DAY_STATUS, DAY_TYPE } from '../constants/index.js';
```

Append to `engine/classify.js`:

```js
/**
 * §16, FR-5.9. A fixed order, the same for every team, never configurable:
 * an OFFICE_ADMIN status override first, then authorised leave, then what
 * the punches show.
 *
 * @param {{
 *   dayType: string,
 *   override: { dayStatus: string } | null,
 *   authorisedLeave: object | null,
 *   punches: Array,
 * }} input
 * @returns {string} one of DAY_STATUS's values
 */
export function resolveDayStatus({ dayType, override, authorisedLeave, punches }) {
  if (override?.dayStatus) return override.dayStatus;
  if (authorisedLeave) return DAY_STATUS.LEAVE;

  const hasPunches = punches.length > 0;

  if (dayType !== DAY_TYPE.WORKING) {
    if (hasPunches) return DAY_STATUS.HOLIDAY_WORK;
    return dayType === DAY_TYPE.HOLIDAY ? DAY_STATUS.HOLIDAY : DAY_STATUS.WEEKLY_OFF;
  }

  return hasPunches ? DAY_STATUS.WFO : DAY_STATUS.ABSENT;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/classify.test.js`
Expected: PASS, all 14 tests (7 from Task 5 + 7 new).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/classify.js engine/__tests__/classify.test.js
git commit -m "feat: resolve a day's status in the fixed override/leave/punches order (ARCHITECTURE 16)"
```

---

### Task 7: `engine/punctuality.js` — `effectiveRequirement`

**Files:**
- Create: `engine/punctuality.js`
- Modify: `constants/index.js` (add `HALF_DAY_PERIOD`)
- Test: `engine/__tests__/punctuality.test.js`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces:
  - `HALF_DAY_PERIOD` — `{ MORNING: 'MORNING', AFTERNOON: 'AFTERNOON' }`.
  - `effectiveRequirement(shiftRequirement, halfDayPeriod)` →
    `{ checkStart: Date, checkEnd: Date, requiredMinutes: number }`, where
    `shiftRequirement` is **not** `shiftWindow`'s return value directly —
    `shiftWindow` returns `{ start, end, invalidField }` with no
    `requiredDailyMinutes`. The caller builds
    `{ start, end, requiredDailyMinutes: shift.requiredDailyMinutes }` by
    combining `shiftWindow(shift, workDate)`'s `start`/`end` with
    `requiredDailyMinutes` from the shift object itself.

- [ ] **Step 1: Add `HALF_DAY_PERIOD` to `constants/index.js`**

Immediately after the `EXCEPTION_CODE` block added in Task 1, insert:

```js
/**
 * D-11 (2026-08-13-phase-5-design.md). Which half of the shift a half-day
 * leave record covers, so lateness and the short-day test are measured
 * against the half the person was actually expected to work.
 */
export const HALF_DAY_PERIOD = Object.freeze({
  MORNING: 'MORNING',
  AFTERNOON: 'AFTERNOON',
});
```

- [ ] **Step 2: Write the failing tests**

Create `engine/__tests__/punctuality.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { effectiveRequirement } from '../punctuality.js';

// Not shiftWindow's raw return value — the caller combines shiftWindow's
// start/end with requiredDailyMinutes from the shift object itself.
const shiftRequirement = {
  start: new Date('2026-08-12T04:00:00Z'), // 09:00 PKT
  end: new Date('2026-08-12T13:00:00Z'), // 18:00 PKT
  requiredDailyMinutes: 540,
};

describe('effectiveRequirement', () => {
  it('returns the shift unchanged for an ordinary (non-half-day) date', () => {
    const result = effectiveRequirement(shiftRequirement, null);
    expect(result).toEqual({
      checkStart: shiftRequirement.start,
      checkEnd: shiftRequirement.end,
      requiredMinutes: 540,
    });
  });

  it('checks the morning against the normal start when the AFTERNOON is leave (D-11)', () => {
    const result = effectiveRequirement(shiftRequirement, 'AFTERNOON');
    expect(result.checkStart.toISOString()).toBe('2026-08-12T04:00:00.000Z'); // 09:00
    expect(result.checkEnd.toISOString()).toBe('2026-08-12T08:30:00.000Z'); // 13:30 = midpoint
    expect(result.requiredMinutes).toBe(270);
  });

  it('checks the afternoon against the midpoint when the MORNING is leave (D-11)', () => {
    const result = effectiveRequirement(shiftRequirement, 'MORNING');
    expect(result.checkStart.toISOString()).toBe('2026-08-12T08:30:00.000Z'); // 13:30 = midpoint
    expect(result.checkEnd.toISOString()).toBe('2026-08-12T13:00:00.000Z'); // 18:00, unchanged
    expect(result.requiredMinutes).toBe(270);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/punctuality.test.js`
Expected: FAIL — `engine/punctuality.js` does not exist.

- [ ] **Step 4: Implement `effectiveRequirement`**

Create `engine/punctuality.js`:

```js
import { addMinutes } from 'date-fns';
import { HALF_DAY_PERIOD } from '../constants/index.js';

/**
 * D-11 (docs/superpowers/specs/2026-08-13-phase-5-design.md). Determines the
 * effective check window and required minutes for the lateness/short-day
 * test, adjusted when the date is a half-day LEAVE.
 *
 * Assumes the shift's published window span equals its required minutes —
 * true of every seeded shift and the only shape the schema currently
 * supports (no separate unpaid-break concept exists).
 *
 * A FULL-day LEAVE has no worked half to check at all — the caller must not
 * call this (or must skip the ladder outright) when the day's status is
 * LEAVE with `amount: 1`. This function only handles the half-day case.
 *
 * @param {{ start: Date, end: Date, requiredDailyMinutes: number }} shiftRequirement
 *   `start`/`end` from `shiftWindow(shift, workDate)`, combined with
 *   `requiredDailyMinutes` from the shift object — not `shiftWindow`'s
 *   return value directly, which carries no `requiredDailyMinutes`.
 * @param {'MORNING'|'AFTERNOON'|null} halfDayPeriod
 * @returns {{ checkStart: Date, checkEnd: Date, requiredMinutes: number }}
 */
export function effectiveRequirement({ start, end, requiredDailyMinutes }, halfDayPeriod) {
  if (!halfDayPeriod) {
    return { checkStart: start, checkEnd: end, requiredMinutes: requiredDailyMinutes };
  }

  const halfMinutes = requiredDailyMinutes / 2;
  const midpoint = addMinutes(start, halfMinutes);

  if (halfDayPeriod === HALF_DAY_PERIOD.AFTERNOON) {
    // Leave in the afternoon: worked the morning, checked from the normal
    // shift start through the midpoint.
    return { checkStart: start, checkEnd: midpoint, requiredMinutes: halfMinutes };
  }

  // MORNING is leave: worked the afternoon, so the check window starts at
  // the shift's midpoint instead of its published start.
  return { checkStart: midpoint, checkEnd: end, requiredMinutes: halfMinutes };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/punctuality.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add constants/index.js engine/punctuality.js engine/__tests__/punctuality.test.js
git commit -m "feat: half-day-aware check window for lateness and short-day tests (D-11)"
```

---

### Task 8: `engine/punctuality.js` — lateness, short-day, and percentage helpers

**Files:**
- Modify: `engine/punctuality.js`
- Test: `engine/__tests__/punctuality.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `lateMinutes(firstCheckIn, checkStart)` → `number`.
  - `earlyMinutes(lastCheckOut, checkEnd)` → `number`.
  - `isCompliant(lateMins, graceMinutes)` → `boolean`.
  - `isShortDay(workedMins, requiredMinutes, thresholdPercent)` → `boolean`.
  - `latenessPercent(lateMins, requiredMinutes)` → `number`.
  - `clockedPercent(workedMins, requiredMinutes)` → `number`.

- [ ] **Step 1: Write the failing tests**

Append to `engine/__tests__/punctuality.test.js`:

```js
import {
  clockedPercent,
  earlyMinutes,
  isCompliant,
  isShortDay,
  lateMinutes,
  latenessPercent,
} from '../punctuality.js';

describe('lateMinutes / isCompliant / isShortDay (ARCHITECTURE 18.3, worked example A)', () => {
  // 9h shift (540 min), grace 30, 09:00-18:00. Check in 11:00, check out 17:00.
  const checkStart = new Date('2026-08-12T04:00:00Z'); // 09:00 PKT
  const checkEnd = new Date('2026-08-12T13:00:00Z'); // 18:00 PKT
  const firstCheckIn = new Date('2026-08-12T06:00:00Z'); // 11:00 PKT
  const lastCheckOut = new Date('2026-08-12T12:00:00Z'); // 17:00 PKT

  it('computes 120 late minutes', () => {
    expect(lateMinutes(firstCheckIn, checkStart)).toBe(120);
  });

  it('is not compliant against a 30-minute grace', () => {
    expect(isCompliant(120, 30)).toBe(false);
  });

  it('computes latenessPercent as 22.2% of the 540-minute requirement', () => {
    expect(latenessPercent(120, 540)).toBeCloseTo(22.222, 2);
  });

  it('computes clockedPercent from 360 worked minutes as 66.7%', () => {
    expect(clockedPercent(360, 540)).toBeCloseTo(66.667, 2);
  });

  it('flags 360 worked minutes as a short day against an 89% threshold', () => {
    expect(isShortDay(360, 540, 89)).toBe(true); // 360 < 540*0.89 = 480.6
  });

  it('computes 0 early minutes when checkout matches the window end', () => {
    expect(earlyMinutes(checkEnd, checkEnd)).toBe(0);
  });

  it('computes a positive early-departure minutes when checkout precedes the window end', () => {
    // lastCheckOut here (17:00) is 1 hour before an 18:00 window end.
    expect(earlyMinutes(lastCheckOut, checkEnd)).toBe(60);
  });
});

describe('lateMinutes / earlyMinutes with no punches', () => {
  it('returns 0 for a null first check-in (ABSENT carries the meaning, not a number here)', () => {
    expect(lateMinutes(null, new Date('2026-08-12T04:00:00Z'))).toBe(0);
  });

  it('returns 0 for a null last check-out', () => {
    expect(earlyMinutes(null, new Date('2026-08-12T13:00:00Z'))).toBe(0);
  });
});

describe('a shift that is not 9 hours (ARCHITECTURE 18.5)', () => {
  // Support team, 6h shift (360 min), 10:00-16:00. Check in 11:30, check out 16:00.
  it('computes 90 late minutes and 25% lateness', () => {
    const checkStart = new Date('2026-08-12T05:00:00Z'); // 10:00 PKT
    const firstCheckIn = new Date('2026-08-12T06:30:00Z'); // 11:30 PKT
    expect(lateMinutes(firstCheckIn, checkStart)).toBe(90);
    expect(latenessPercent(90, 360)).toBe(25);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/punctuality.test.js`
Expected: FAIL — the six new functions are not exported.

- [ ] **Step 3: Implement the remaining functions**

Append to `engine/punctuality.js`:

```js
/**
 * §17. Lateness is measured from the effective check-window start — the
 * shift's own start on an ordinary day, or `effectiveRequirement`'s
 * half-day-adjusted one. `null` (no check-in at all) is 0, not "infinitely
 * late" — the day's ABSENT status is what carries that meaning.
 */
export function lateMinutes(firstCheckIn, checkStart) {
  if (!firstCheckIn) return 0;
  return Math.max(0, (firstCheckIn.getTime() - checkStart.getTime()) / 60000);
}

/** §17. The mirror of `lateMinutes` at the other end of the check window. */
export function earlyMinutes(lastCheckOut, checkEnd) {
  if (!lastCheckOut) return 0;
  return Math.max(0, (checkEnd.getTime() - lastCheckOut.getTime()) / 60000);
}

/**
 * §17.1, BR-6/BR-7: compliant if arrival is at or before the shift start
 * plus its grace period. Grace decides compliance; it is never subtracted
 * from `lateMinutes` itself.
 */
export function isCompliant(lateMins, graceMinutes) {
  return lateMins <= graceMinutes;
}

/** BR-5: short if less than `thresholdPercent` of the required duration was clocked. */
export function isShortDay(workedMins, requiredMinutes, thresholdPercent) {
  return workedMins < (requiredMinutes * thresholdPercent) / 100;
}

/** §17.2: both ladder tests share `requiredMinutes` as their denominator. */
export function latenessPercent(lateMins, requiredMinutes) {
  return (lateMins / requiredMinutes) * 100;
}

/** §17.2: the clocked-side counterpart to `latenessPercent`. */
export function clockedPercent(workedMins, requiredMinutes) {
  return (workedMins / requiredMinutes) * 100;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/punctuality.test.js`
Expected: PASS, all 13 tests (3 from Task 7 + 10 new).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/punctuality.js engine/__tests__/punctuality.test.js
git commit -m "feat: lateness, short-day and percentage helpers (ARCHITECTURE 17)"
```

---

### Task 9: `engine/ladders.js` — `deductionFor`

**Files:**
- Create: `engine/ladders.js`
- Test: `engine/__tests__/ladders.test.js`

**Interfaces:**
- Consumes: nothing from this plan (the `ladder` argument is
  `teamPolicy.leaveDeductionLadder`, shaped as seeded in
  `scripts/seed.js` — Task 10 adds the `didNotAttend` flag this function
  requires).
- Produces:
  `deductionFor({ latenessPercent, clockedPercent, attended, ladder })` →
  `number`.

- [ ] **Step 1: Write the failing tests**

Create `engine/__tests__/ladders.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { deductionFor } from '../ladders.js';

// The exact BR-9 seed profile B shape from scripts/seed.js, after Task 10's
// didNotAttend fix.
const ladder = [
  { latenessFrom: 10, latenessTo: 40, clockedFrom: 55, clockedTo: 80, deduction: 0.25 },
  { latenessFrom: 40, latenessTo: 55, clockedFrom: 33, clockedTo: 55, deduction: 0.5 },
  { latenessFrom: 55, latenessTo: null, clockedFrom: 0, clockedTo: 33, deduction: 0.75 },
  {
    latenessFrom: null,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 0,
    deduction: 1,
    didNotAttend: true,
  },
];

describe('deductionFor', () => {
  it('matches worked example A: lateness and hours agree (ARCHITECTURE 18.3)', () => {
    const deduction = deductionFor({
      latenessPercent: 22.222,
      clockedPercent: 66.667,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.25);
  });

  it('matches worked example B: on time but short hours still deducts (ARCHITECTURE 18.4)', () => {
    const deduction = deductionFor({
      latenessPercent: 3.7,
      clockedPercent: 22.2,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.75);
  });

  it('matches worked example C: a 6-hour shift, same percentages (ARCHITECTURE 18.5)', () => {
    const deduction = deductionFor({
      latenessPercent: 25,
      clockedPercent: 75,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.25);
  });

  it('returns the did-not-attend row, found by its flag, when attended is false', () => {
    const deduction = deductionFor({
      latenessPercent: 0,
      clockedPercent: 0,
      attended: false,
      ladder,
    });
    expect(deduction).toBe(1);
  });

  it('takes the worse of the two tests when they disagree (BR-9)', () => {
    // Lateness band 1 (0.25) but clocked band 3 (0.75) — clocked wins.
    const deduction = deductionFor({
      latenessPercent: 15,
      clockedPercent: 10,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0.75);
  });

  it('returns 0 when neither band is reached', () => {
    const deduction = deductionFor({
      latenessPercent: 5,
      clockedPercent: 95,
      attended: true,
      ladder,
    });
    expect(deduction).toBe(0);
  });

  it('treats lateness bands as (from, to] and clocked bands as [from, to)', () => {
    // Exactly 10% lateness does NOT qualify band 1 (over 10, not at 10).
    expect(
      deductionFor({ latenessPercent: 10, clockedPercent: 95, attended: true, ladder }),
    ).toBe(0);
    // Exactly 40% lateness DOES still qualify band 1 (up to and including 40).
    expect(
      deductionFor({ latenessPercent: 40, clockedPercent: 95, attended: true, ladder }),
    ).toBe(0.25);
    // Exactly 80% clocked does NOT qualify band 1 (under 80, not at 80).
    expect(
      deductionFor({ latenessPercent: 0, clockedPercent: 80, attended: true, ladder }),
    ).toBe(0);
    // Exactly 55% clocked DOES qualify band 1 (55 up to under 80).
    expect(
      deductionFor({ latenessPercent: 0, clockedPercent: 55, attended: true, ladder }),
    ).toBe(0.25);
  });

  it('returns 0 for an attended day against an unconfigured did-not-attend row (I-5: no guess)', () => {
    const noFlagLadder = ladder.map(({ didNotAttend, ...row }) => row);
    const deduction = deductionFor({
      latenessPercent: 0,
      clockedPercent: 0,
      attended: false,
      ladder: noFlagLadder,
    });
    expect(deduction).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/__tests__/ladders.test.js`
Expected: FAIL — `engine/ladders.js` does not exist.

- [ ] **Step 3: Implement `deductionFor`**

Create `engine/ladders.js`:

```js
/**
 * §18.1, BR-9, D-14. The worse of two band tests, or the ladder's
 * did-not-attend row when the day was not attended at all.
 *
 * Lateness bands are `(from, to]` — spec.md's "over X up to Y" — and clocked
 * bands are `[from, to)` — "X up to under Y". `to: null` means unbounded
 * above. The did-not-attend row is found by its `didNotAttend` flag, never
 * by band search (D-14) — a row with `latenessFrom: null` does not
 * participate in the lateness test at all, and is excluded from the clocked
 * test outright regardless of what its clocked bounds happen to be.
 *
 * @param {{
 *   latenessPercent: number,
 *   clockedPercent: number,
 *   attended: boolean,
 *   ladder: Array<{ latenessFrom, latenessTo, clockedFrom, clockedTo, deduction, didNotAttend?: boolean }>,
 * }} input
 * @returns {number} the deduction, in days
 */
export function deductionFor({ latenessPercent, clockedPercent, attended, ladder }) {
  if (!attended) {
    // Invariant I-5: an unconfigured ladder (no flagged row) deducts
    // nothing rather than guessing which row was meant. policyCompleteness
    // (Phase 4) already flags an empty leaveDeductionLadder separately.
    const row = ladder.find((candidate) => candidate.didNotAttend);
    return row ? row.deduction : 0;
  }

  const byLateness = ladder
    .filter((row) => row.latenessFrom !== null && row.latenessFrom !== undefined)
    .filter(
      (row) =>
        latenessPercent > row.latenessFrom &&
        (row.latenessTo === null || latenessPercent <= row.latenessTo),
    )
    .reduce((max, row) => Math.max(max, row.deduction), 0);

  const byClocked = ladder
    .filter((row) => !row.didNotAttend)
    .filter((row) => row.clockedFrom !== null && row.clockedFrom !== undefined)
    .filter(
      (row) =>
        clockedPercent >= row.clockedFrom &&
        (row.clockedTo === null || clockedPercent < row.clockedTo),
    )
    .reduce((max, row) => Math.max(max, row.deduction), 0);

  return Math.max(byLateness, byClocked);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/__tests__/ladders.test.js`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add engine/ladders.js engine/__tests__/ladders.test.js
git commit -m "feat: leave deduction ladder, the worse of lateness and hours-clocked (ARCHITECTURE 18)"
```

---

### Task 10: `scripts/seed.js` — flag the did-not-attend row (`D-14`)

**Files:**
- Modify: `scripts/seed.js:161-167` (the fourth `leaveDeductionLadder` row)
- Test: none new — this is what makes Task 9's "unconfigured did-not-attend"
  test meaningfully distinct from the real seed, and is checked by re-running
  Task 9's suite.

**Interfaces:**
- Consumes: nothing.
- Produces: `leaveDeductionLadder`'s last seed row now carries
  `didNotAttend: true`, matching `ctoApplicationLadder`'s existing row of the
  same kind.

- [ ] **Step 1: Make the change**

In `scripts/seed.js`, the `leaveDeductionLadder` array currently ends with:

```js
  {
    latenessFrom: null,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 0,
    deduction: 1,
  },
];
```

Change it to:

```js
  {
    latenessFrom: null,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 0,
    deduction: 1,
    didNotAttend: true,
  },
];
```

Directly above the `leaveDeductionLadder` declaration, update the existing
comment block to note the flag:

```js
/**
 * BR-9 seed profile B, as implemented in the old workbook and converted to
 * percentages. Absolute hour bands only made sense for a 9 hour day and
 * broke silently for any other shift length.
 *
 * The last row is flagged `didNotAttend: true` rather than matched by its
 * zero-width clocked band, matching how `ctoApplicationLadder`'s equivalent
 * row already works — `engine/ladders.js`'s `deductionFor` looks for the
 * flag directly (design record D-14).
 */
```

- [ ] **Step 2: Verify no existing test depended on the old shape**

Run: `npx vitest run __tests__/database.teamPolicy.test.js`
Expected: PASS unchanged — that suite writes its own inline ladder fixtures
(`leaveDeductionLadder: [{ deduction: 0.25 }]`) and does not read the seed's
did-not-attend row, so this change does not affect it.

- [ ] **Step 3: Re-run the engine ladder suite**

Run: `npx vitest run engine/__tests__/ladders.test.js`
Expected: PASS — unchanged, since Task 9's tests already used the post-fix
shape (`didNotAttend: true`) directly in their own local fixture rather than
importing the seed.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint
git add scripts/seed.js
git commit -m "fix: flag the leave deduction ladder's did-not-attend row explicitly (D-14)"
```

---

### Task 11: Branch verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full lint check**

Run: `npm run lint`
Expected: exits 0. If not, run `npm run lint:fix` and re-check — `CLAUDE.md`
notes a second pass is sometimes needed after large edits.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: every test passes, including all pre-existing Phase 4 tests
(nothing in this branch touched `database.js`, `app/`, or any API route, so
none of them should be affected).

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: succeeds. This branch added no React component and no route, so the
build should be unaffected; this step catches an accidental stray import
(e.g. an engine file importing `database.js`) that lint alone would not.

- [ ] **Step 4: Confirm no engine file imports `database.js`, `app/`, or `components/`**

Run: `grep -rn "from '.*database" engine/*.js` and `grep -rn "from '.*app/\|from '.*components/" engine/*.js`
Expected: no matches in `workDate.js`, `duration.js`, `classify.js`,
`punctuality.js`, or `ladders.js`. `recalculate.js` is untouched by this
branch and keeps its existing no-op body — Branch 2 fills it in.

- [ ] **Step 5: Update `README.md`'s feature table**

`README.md`'s "What is built" table currently lists:

```
| Day classification (`FR-5.x`) | Not started |
```

Change that row to:

```
| Day classification (`FR-5.x`) | Engine core built; not yet wired to real attendance data |
```

This is accurate and not overstated: the pure functions exist and are
exhaustively tested, but nothing calls them from a route yet — that is
Branch 2.

- [ ] **Step 6: Final commit**

```bash
git add README.md
git commit -m "docs: note engine core's built status in the README feature table"
```

- [ ] **Step 7: Push the branch for review**

```bash
git push -u origin phase-5-engine-core
```

Report back: all engine core functions built and exhaustively tested, `npm
test`/`npm run lint`/`npm run build` all green, ready for Ahmar to review
before Branch 2 (`phase-5-m4a-attendance-capture`) starts.

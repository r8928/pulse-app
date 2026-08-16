# Phase 5 Branch 2b · Attendance Screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the working engine behind two screens — `S-10`, where one team's
day is entered and corrected, and `S-12`, where everything the engine concluded
about one person on one date is explained — plus the five popups that write
through them.

**Architecture:** Server pages read through `database.js` and pass plain props
to a client leaf; the leaf is pure (data in, callbacks out) and every write
goes through one mutation hook (`ARCHITECTURE.md` §10.1, §10.2). No component
fetches, no component holds business logic, and no component reads the session
— `session.user` arrives as a prop.

**Tech Stack:** Next.js 16 App Router server components, MUI v9, Vitest +
Testing Library (`jsx` files run in the `dom` project).

**Spec:** `list-of-screens.md` `S-10`, `S-12`, `P-21`–`P-25`; `ARCHITECTURE.md`
§10, §12.1, §25; `DESIGN.md`; the Branch 2a contracts already built and tested.

## Global Constraints

- **MUI v9 only** (`CLAUDE.md`): `sx` for layout, `slotProps.<slot>`, Grid
  `size`, Stack/Grid as containers — never Box as a flex wrapper, never
  `InputLabelProps`/`inputProps`, never Grid `xs/sm/md`.
- **No design token inline.** Hexes live in `app/theme/colors.js`; radii,
  spacing and typography in `app/theme/theme.js`. Never set
  `fontSize`/`fontWeight`/`fontFamily` on a component — select a variant.
- **A status is never colour alone** (`NFR-12`, `DC-11`): every status chip
  carries an icon and a written label, through a theme variant.
- **No custom margin/padding values in `sx`** — `spacing`/`gap` on Stack,
  `spacing` on Grid.
- **Forms: Enter submits, Esc cancels.** A real `<form onSubmit>` with
  `event.preventDefault()`, `type='submit'` on the primary button and
  `type='button'` on every other.
- **No raw SVG or emoji icons**, and no `@mui/icons-material` name used without
  verifying the export exists.
- **TDD** (`CLAUDE.md`): the component test is written and watched to fail
  before the component exists.
- **Test observable behaviour** — state, role, variant, visibility, enabled or
  disabled. A design-token change must not break an app test.
- Commit after every task; `npm run lint` exits 0 before each commit.

---

## File structure

| File | Responsibility |
| ---- | -------------- |
| `utils/duration.js` | `formatDuration(minutes)` → `'8h 02m'`, and `formatClock(instant, timezone)` → `'09:02'`. Pure, shared by both screens. |
| `hooks/useAttendanceMutations.js` | Every M-4 write, behind the existing `useMutations` conflict surface. |
| `components/attendance/DayStatusChip.jsx` | One status → one theme variant + icon + label. |
| `components/attendance/AttendanceGrid.jsx` | `S-10`. The dense write surface. |
| `components/attendance/DayRecordDetail.jsx` | `S-12`. Punches, computed values, deduction, overrides. |
| `components/attendance/PunchDialog.jsx` | `P-21` add or edit a punch. |
| `components/attendance/DayStatusDialog.jsx` | `P-23` set day status, including LEAVE with its type. |
| `components/attendance/AdjustHoursDialog.jsx` | `P-24` correct the hours. |
| `components/attendance/WaiveDeductionDialog.jsx` | `P-25` waive a late arrival or short day. |
| `app/(app)/attendance/entry/page.js` | `S-10`'s server half. |
| `app/(app)/attendance/[userId]/[date]/page.js` | `S-12`'s server half. |

`P-22` (soft delete a punch) reuses the existing `components/ReasonDialog.jsx`
rather than adding a fourth near-identical dialog.

---

### Task 1: `utils/duration.js` — reading a duration and a clock time

**Files:**
- Create: `utils/duration.js`
- Test: `utils/__tests__/duration.test.js`

**Interfaces:**
- Produces `formatDuration(minutes)` → `'8h 02m'`, `'—'` for null/0-with-no-punches
  is the *caller's* decision, so this returns `'0h 00m'` for 0.
- Produces `formatClock(instant, timezone)` → `'09:02'` in that shift's zone.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration } from '../duration.js';

describe('formatDuration', () => {
  it('reads hours and padded minutes', () => {
    expect(formatDuration(482)).toBe('8h 02m');
  });

  it('reads a whole number of hours', () => {
    expect(formatDuration(540)).toBe('9h 00m');
  });

  it('reads under an hour', () => {
    expect(formatDuration(7)).toBe('0h 07m');
  });

  it('reads zero as a duration rather than as nothing', () => {
    expect(formatDuration(0)).toBe('0h 00m');
  });

  it('rounds a fractional minute rather than printing it', () => {
    expect(formatDuration(59.6)).toBe('1h 00m');
  });
});

describe('formatClock', () => {
  it('reads an instant in the shift\'s own timezone, not the reader\'s', () => {
    // 04:02Z is 09:02 in Asia/Karachi (UTC+5).
    expect(formatClock(new Date('2026-08-12T04:02:00Z'), 'Asia/Karachi')).toBe('09:02');
  });

  it('reads the same instant differently in another zone', () => {
    expect(formatClock(new Date('2026-08-12T04:02:00Z'), 'UTC')).toBe('04:02');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run utils/__tests__/duration.test.js`
Expected: FAIL — `utils/duration.js` does not exist.

- [ ] **Step 3: Implement**

```js
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * A worked duration, read the way a timesheet reads: hours and minutes, never
 * a decimal. `8.03 hours` is not a figure anyone checks against a clock.
 */
export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  return `${hours}h ${String(total % 60).padStart(2, '0')}m`;
}

/**
 * §7.2: an instant is stored in UTC and READ in the timezone of the shift it
 * belongs to. A punch shown in the reader's own zone would put a Karachi night
 * shift on the wrong side of midnight for anyone viewing from elsewhere.
 */
export function formatClock(instant, timezone) {
  return format(toZonedTime(instant, timezone), 'HH:mm');
}
```

- [ ] **Step 4: Run it and watch it pass** — 7 tests.
- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add utils/duration.js utils/__tests__/duration.test.js
git commit -m "feat: read a duration as hours and minutes, and a punch in its shift's timezone"
```

---

### Task 2: `hooks/useAttendanceMutations.js`

**Files:**
- Create: `hooks/useAttendanceMutations.js`
- Test: `hooks/__tests__/useAttendanceMutations.test.jsx`

**Interfaces:**
- Consumes `useMutations()` — `post`, `patch`, plus `pending`, `error`,
  `conflict`, `dismissConflict`.
- Produces: `createPunch`, `updatePunch`, `softDeletePunch`, `setDayOverride`,
  `clearDayOverride`, `recordLeave`, `cancelLeave`, plus the state passthrough.

The client half of the Branch 2a contracts. Every URL here is asserted by a
Branch 2a contract test from the server side; this task asserts the same URLs
from the client side, which is what `CLAUDE.md` means by testing a contract
from both ends.

- [ ] **Step 1: Write the failing test**

Follow `hooks/__tests__/useMutations.test.jsx`'s shape (mock `global.fetch`,
render the hook through a probe component, assert the URL, method and body).
Assert at minimum:

- `createPunch` POSTs to `/api/punches` with the body it was given.
- `updatePunch` PATCHes `/api/punches/<id>`.
- `softDeletePunch` POSTs to `/api/punches/<id>/soft-delete`.
- `setDayOverride` PATCHes `/api/attendance/<userId>/<date>/override`.
- `clearDayOverride` DELETEs the same path.
- `recordLeave` POSTs to `/api/leave-records`.
- `cancelLeave` POSTs to `/api/leave-records/<id>/soft-delete`.
- A 409 surfaces as `conflict` rather than `error`, because `P-47` shows the
  current state.

`useMutations` has no `del` yet — add one alongside its `post`/`patch`/`put`
in the same task, tested through this hook.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement both the `del` helper and the hook**
- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 3: `components/attendance/DayStatusChip.jsx`

**Files:**
- Create: `components/attendance/DayStatusChip.jsx`
- Test: `components/attendance/__tests__/DayStatusChip.test.jsx`

**Interfaces:**
- Produces `<DayStatusChip status={DAY_STATUS} overridden={boolean} />`.

Each `DAY_STATUS` maps to one existing theme chip variant and one verified
`@mui/icons-material` export. The mapping is a component-level lookup from a
domain value to a variant name — the same thing `TeamStatusChip` already does —
not a style map, so it does not belong in `theme.js`.

| Status | Variant | Icon |
| ------ | ------- | ---- |
| `WFO` | `statusSuccess` | `BusinessOutlined` |
| `WFH` | `statusInfo` | `HomeOutlined` |
| `LEAVE` | `statusInfo` | `EventBusyOutlined` |
| `HOLIDAY_WORK` | `statusWarning` | `CelebrationOutlined` |
| `WEEKLY_OFF` | `statusNeutral` | `WeekendOutlined` |
| `HOLIDAY` | `statusNeutral` | `CelebrationOutlined` |
| `ABSENT` | `statusDanger` | `CancelOutlined` |

- [ ] **Step 1: Write the failing test.** Assert: each status renders its own
  written label (never colour alone); an overridden status is marked as set by
  an administrator; an unknown status renders a neutral chip rather than
  throwing.
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Verify every icon name above exists in
  `node_modules/@mui/icons-material` before importing it.**
- [ ] **Step 4: Implement**
- [ ] **Step 5: Run it and watch it pass**
- [ ] **Step 6: Lint and commit**

---

### Task 4: `components/attendance/PunchDialog.jsx` (`P-21`)

**Files:**
- Create: `components/attendance/PunchDialog.jsx`
- Test: `components/attendance/__tests__/PunchDialog.test.jsx`

**Interfaces:**
- `<PunchDialog punch={Punch|{}} userName timezone open onClose onSubmit pending error />`
- `onSubmit({ at, type, reason })` — `at` an ISO instant built from the local
  date and time fields in the shift's timezone.

- [ ] **Step 1: Write the failing test.** Assert:
  - the dialog names whose punch it is;
  - editing an existing punch pre-fills its time and type;
  - Enter submits (a real form), and the payload carries the type chosen;
  - an edit requires a reason and the submit button is disabled without one —
    `FR-4.12` makes every fix a manual adjustment under `FR-4.10`;
  - creating a punch does not require a reason;
  - Esc calls `onClose` without submitting;
  - `error` is displayed rather than swallowed.
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement** — `<Dialog>` with a real `<form onSubmit>`, a
  `TextField type='date'`, a `TextField type='time'`, and a labelled select for
  the type with `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}`.
- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 5: `DayStatusDialog`, `AdjustHoursDialog`, `WaiveDeductionDialog` (`P-23`–`P-25`)

**Files:**
- Create: the three components under `components/attendance/`
- Test: one test file each, under `components/attendance/__tests__/`

**Interfaces:**
- `<DayStatusDialog record leaveTypes open onClose onSubmit pending error />` →
  `onSubmit({ dayStatus, leaveType, amount, halfDayPeriod, reason })`. Choosing
  `LEAVE` reveals the type, the amount and — for a half day — the period,
  because `D-9` makes that a leave record rather than a bare status.
- `<AdjustHoursDialog record open onClose onSubmit … />` →
  `onSubmit({ workedMinutes, reason })`.
- `<WaiveDeductionDialog record open onClose onSubmit … />` →
  `onSubmit({ deduction: 0, lateMinutes?, reason })`.

- [ ] **Step 1: Write the failing tests.** Assert per dialog:
  - the engine's current value is shown beside the field, so the administrator
    sees what they are replacing (`FR-6.11`);
  - a reason is mandatory and submit is disabled without one;
  - `DayStatusDialog` reveals the leave type only for `LEAVE`, and the AM/PM
    period only for a half day (`D-11`);
  - `WaiveDeductionDialog` states that waiving makes the day compliant
    (`BR-8`), and submits `deduction: 0` rather than clearing the field;
  - each is a real form: Enter submits, Esc cancels.
- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Lint and commit**

---

### Task 6: `components/attendance/AttendanceGrid.jsx` (`S-10`)

**Files:**
- Create: `components/attendance/AttendanceGrid.jsx`
- Test: `components/attendance/__tests__/AttendanceGrid.test.jsx`

**Interfaces:**
- `<AttendanceGrid teams rows teamId date canWrite leaveTypes />` where each row
  is `{ user, dayRecord, punches, shift }`, already joined by the server page.

The dense table Ahmar chose: one compact row per member, every column visible,
the dialogs opened from a row menu.

| Column | Source |
| ------ | ------ |
| Employee | `user.fullName`, with the employee code beneath |
| Punches | each pair as `09:02 → 18:04` in the shift's timezone; a missing counterpart shows `→ —` |
| Worked | `formatDuration(effective(record, 'workedMinutes'))` |
| Day type | `record.dayType` |
| Status | `<DayStatusChip>` with its override marker |
| Late | `effective(record, 'lateMinutes')`, blank at zero |
| Deduction | the amount and the rule that produced it (`FR-7.6`) |
| | an exception indicator, and the row menu |

- [ ] **Step 1: Write the failing test.** Assert:
  - a member with punches shows their pair and worked duration;
  - a member with none shows `ABSENT` and the deduction the ladder produced;
  - an untracked user does not appear at all (`FR-2.10`) — the server excludes
    them, so the test asserts the grid renders only the rows it is given and
    states the exclusion;
  - a day whose shift is unknown shows an empty status and a link to `P-12`
    rather than a guess (`FR-3.12`);
  - an overridden value is marked as an administrator's decision;
  - a row carrying an exception is flagged;
  - the row menu is absent without `canWrite`;
  - the empty state for a date outside everyone's employment period says so
    rather than rendering an empty table.
- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 7: `components/attendance/DayRecordDetail.jsx` (`S-12`)

**Files:**
- Create: `components/attendance/DayRecordDetail.jsx`
- Test: `components/attendance/__tests__/DayRecordDetail.test.jsx`

**Interfaces:**
- `<DayRecordDetail user dayRecord punches leaveRecord ledgerEntries shift canWrite leaveTypes />`

Four sections, exactly as `list-of-screens.md` states them: **Punches**
(instant, type, source, work date, duplicate flag), **Computed** (duration, day
type, day status, late and early minutes, and the classification order that
produced the status), **Deduction** (the amount and its named rule), and
**Overrides** (each beside the engine's value with who, why and when).

- [ ] **Step 1: Write the failing test.** Assert:
  - every punch appears with its source and work date;
  - a duplicate punch is shown as excluded rather than hidden (`I-1`);
  - a soft-deleted punch is visible and marked;
  - the classification order is explained — the reader can see *why* the status
    is what it is (`FR-5.9`, `NFR-11`);
  - the deduction names its ladder row (`FR-7.6`);
  - an override renders beside the engine's value with actor, reason and time,
    and the engine's own value is still readable (`FR-6.11`, `FR-6.12`);
  - the ledger movements the day produced are listed, a reversal marked as one;
  - a day with no shift names the reason and links to `P-12`.
- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 8: The two server pages

**Files:**
- Replace: `app/(app)/attendance/entry/page.js`, `app/(app)/attendance/[userId]/[date]/page.js`
- Modify: `database.js` if a join the pages need is not yet expressible

**Interfaces:** none consumed by later tasks.

- [ ] **Step 1: `S-10`'s page.** Reads `teamId` and `date` from
  `searchParams`, defaulting the date to today and the team to the viewer's
  own. Calls the materialising read so every tracked member of that team has a
  record for that date (`D-15`), joins punches and shifts per user in
  `database.js`, and passes plain rows to `AttendanceGrid`. `session.user`
  arrives as a prop; the component never reads the session (`CLAUDE.md`).
- [ ] **Step 2: `S-12`'s page.** Awaits `params`, loads the day through the
  same `database.js` functions the API route uses, and renders
  `DayRecordDetail`. A date with no record renders the `FR-2.12` empty state
  rather than a 404 page.
- [ ] **Step 3: Run `npm run build`** — a server component importing a client
  hook, or a client component missing `'use client'`, fails here rather than in
  the browser.
- [ ] **Step 4: Lint and commit**

---

### Task 9: `S-07`'s Attendance tab

**Files:**
- Modify: `components/UserDetail.jsx` and its test

`UserDetail` already renders tabs whose collections are empty "until the engine
and ledger ship". The engine has now shipped, so the Attendance tab lists that
user's recent day records, each linking to `S-12`.

- [ ] **Step 1: Write the failing test** — the tab lists a day record with its
  status and links to that date's detail; an empty tab says the user has no
  records yet rather than rendering an empty table.
- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**, including the loader the page passes in.
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Lint and commit**

---

### Task 10: Branch verification and merge

- [ ] **Step 1:** `npm run lint` — exits 0.
- [ ] **Step 2:** `npm test` — every test passes.
- [ ] **Step 3:** `npm run build` — succeeds.
- [ ] **Step 4:** Update `README.md`'s feature table: `S-10` and `S-12` are
  built; `S-09` and `S-11` remain stubs until Branch 3.
- [ ] **Step 5:** Update `ARCHITECTURE.md` §25 wherever the build proved it
  wrong, in the same change (§34).
- [ ] **Step 6:** Commit, then squash-merge the whole of Branch 2 into `main`.

---

## Self-review

**Screen coverage.** `S-10` Tasks 6, 8 · `S-12` Tasks 7, 8 · `P-21` Task 4 ·
`P-22` Task 6 (via `ReasonDialog`) · `P-23`–`P-25` Task 5 · `S-07` Attendance
tab Task 9.

**Deliberately not here.** `S-09` and `S-11` are Branch 3. `P-46`/`P-47` (the
confirm and conflict popups) already exist from Phase 4 and are reused.
`P-07` resolve-duplicate-punch is Phase 6, reached only from `S-05`.

**Type consistency.** `formatDuration`/`formatClock` (Task 1) are used with
those exact signatures in Tasks 6 and 7. `effective(dayRecord, field)` from
Branch 2a is the only way either screen reads a value. `DayStatusChip`'s props
(Task 3) are consumed unchanged by Tasks 6 and 7. Every URL in Task 2's hook
matches a route asserted by a Branch 2a contract test.

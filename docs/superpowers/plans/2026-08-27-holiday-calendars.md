# Holiday Calendars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the holiday calendar from something each team owns into a
company-wide record that teams are assigned to, and move the weekly off pattern
onto it.

**Architecture:** A new `holidayCalendars` collection; `holidays` and
`weeklyOffPatterns` re-key from `teamId` to `calendarId`; `teams` gain a
nullable `calendarId`. The engine is untouched — `database.js` grows
`listHolidaysForTeam` / `getWeeklyOffPatternForTeam`, which resolve the team's
calendar and delegate, so the `holidaysByTeam` / `weeklyOffByTeam` maps every
pure function consumes keep exactly their present shape.

**Tech Stack:** Next.js 16 (App Router), MUI v9, MongoDB 7 driver, Zod 4,
Vitest 4 with `mongodb-memory-server`, Biome.

**Spec:** `docs/superpowers/specs/2026-08-27-holiday-calendars-design.md`

## Global Constraints

- Every MongoDB query lives in `database.js`. No inline queries in `page.js` or
  a route file, even for a single caller.
- Soft delete only. There is no hard-delete function and none may be added.
- All auth/session validation lives in `proxy.js`. Handlers call
  `requireActor` / `assertPermission` / `assertRecordInScope` from
  `authz/guard.js` and nothing else.
- Server components read the session and pass `session.user` down as props.
  Client components never read a session.
- No domain enum literals inline — import from `constants/index.js`.
- MUI v9 only: `sx` for layout, `slotProps.<slotName>`, Grid `size`,
  Stack/Grid as layout containers. No `Box` as a flex wrapper, no `xs/sm/md` on
  Grid, no `inputProps`/`InputLabelProps`.
- No design tokens inline. Colours live in `app/theme/colors.js`; radii,
  shadows, spacing and typography metrics in `app/theme/theme.js`.
- Forms: a real `<form onSubmit>` with `event.preventDefault()`,
  `type='submit'` on the primary button and `type='button'` on every other.
- Dates go through `date-fns`. No `new Date()` for parsing or arithmetic.
- `npm run lint` must exit 0 before every commit. Never `--no-verify`.
- Run `npm run lint:fix` twice after large edits.
- Do **not** run `npm run build` without asking — it collides with a running
  `npm run dev` over `.next`.
- The branch is `holiday-calendars`, already created off `main`.

---

### Task 1: Documentation first

The spec-first rule: `README.md` is updated *before* implementing, and
`spec.md` wins over everything, so the requirement change is recorded before
any code contradicts it.

**Files:**
- Modify: `spec.md:185-186` (`FR-3.7`, `FR-3.8`), `spec.md:342` (`BR-15`)
- Modify: `README.md` — the "What is built" table
- Modify: `ARCHITECTURE.md` — the S-17 and holiday/weekly-off sections
- Modify: `list-of-screens.md` — add `S-26`, amend `S-17`

**Interfaces:**
- Consumes: nothing.
- Produces: the screen id `S-26` and the wording every later task quotes.

- [ ] **Step 1: Amend `spec.md` FR-3.7**

Replace line 185's requirement text with:

```
Hold holiday calendars as company-wide records holding typed entries (public
holiday, company holiday), which `OFFICE_ADMIN` may create, edit, and soft
delete. Each team is assigned exactly one calendar, and that calendar applies
to every member of the team. Calendars are shared: several teams may sit on
one, and two teams on different calendars therefore observe different holidays
on the same date. A calendar is never created automatically when a team is
created. A calendar shall never depend on formatting or colour. Company-wide
configuration, assigned per team.
```

- [ ] **Step 2: Amend `spec.md` FR-3.8**

Replace line 186's requirement text with:

```
Give each holiday calendar its own weekly off pattern, so a team whose non
working days are not Saturday and Sunday is supported. The pattern belongs to
the calendar rather than the team, because the calendar already answers which
dates are not working days and two owners for one question would let a team
observe one calendar's holidays on another's working week. Company-wide
configuration, assigned per team.
```

- [ ] **Step 3: Amend `spec.md` BR-15**

Change the `Per team` scope column to `Per calendar`, and replace **Each team
keeps its own holiday calendar** with **Each team is assigned one holiday
calendar, shared with other teams**. Keep the rest of the cell — the fixed-in-
advance rule and the audited mid-year correction are unchanged. Append: `Such a
correction recalculates the affected dates for every team assigned to the
calendar.`

- [ ] **Step 4: Add the `S-26` row to `list-of-screens.md`**

In the screen table, after the `S-22` row:

```
| `S-26` | `P4` | Holiday calendars | `/settings/holiday-calendars` | Company-wide holiday calendars: create, rename, soft delete, edit holidays and the weekly off pattern, and assign teams. Reached from `S-18`. | `FR-3.7`, `FR-3.8` |
```

Amend the `S-17` row's behaviour text: its holiday and weekly-off tabs are now
one read-only tab naming the assigned calendar and linking to `S-26`.

- [ ] **Step 5: Update the `README.md` feature table**

Replace the row `| Team configuration: shifts, calendar, weekly off, policy, ladders (S-17) | Done |` with two rows:

```
| Team configuration: shifts, policy, ladders (`S-17`) | Done — the calendar and weekly off are read-only here, owned by `S-26` |
| Holiday calendars, shared across teams (`S-26`) | Done — a calendar holds the holidays and the weekly off; each team is assigned exactly one |
```

Add to "Things that will bite you":

```
**A calendar is shared, so one edit fans out.** Holidays and the weekly off
pattern belong to a calendar, not a team, and a calendar serves several teams.
Every mutation recalculates every assigned team — and a team assignment change
recalculates both the team joining and the team leaving, because the day type
of every date changes for both.

**A team with no calendar is unconfigured, not defaulted.** It reads as no
holidays and no weekly off, and `policyCompleteness` reports it. There is no
default calendar: falling back to Saturday and Sunday is the exact assumption
`FR-3.8` forbids.
```

- [ ] **Step 6: Update `ARCHITECTURE.md`**

Find every section describing per-team holidays or the weekly off pattern and
correct it to the calendar-owned model, quoting `D-28` through `D-34` from the
design doc. The `S-17` section loses its weekly-off editing description and
gains the read-only tab; add an `S-26` section describing the three panels.

- [ ] **Step 7: Run lint and commit**

```bash
npm run lint
git add spec.md README.md ARCHITECTURE.md list-of-screens.md
git commit -m "docs: a calendar is assigned to a team, not owned by one"
```

---

### Task 2: The `holidayCalendars` collection and its CRUD

**Files:**
- Modify: `constants/index.js` — add `COLLECTIONS.HOLIDAY_CALENDARS`
- Modify: `database.js` — schema near `holidaySchema` (line ~250), indexes in
  `ensureIndexes` (line ~505), CRUD in a new `--- Holiday calendars ---`
  section above `--- Holidays ---` (line ~2921)
- Test: `__tests__/database.holidayCalendars.test.js`

**Interfaces:**
- Consumes: `createOwnedRecord`, `softDeleteOwnedRecord`, `updateWithVersion`,
  `parse`, `reasonSchema`, `ValidationError` — all already in `database.js`.
- Produces:
  - `holidayCalendarSchema` — `{ name: string }`
  - `listHolidayCalendars({ includeDeleted = false, companyId }) → { items, total }`
  - `createHolidayCalendar(input, actor, companyId) → doc`
  - `updateHolidayCalendar(id, patch, version, actor, companyId) → doc | null`
  - `softDeleteHolidayCalendar(id, input, version, actor, companyId) → doc | null`
  - `getHolidayCalendarById(id, companyId) → doc | null`

- [ ] **Step 1: Write the failing test**

Create `__tests__/database.holidayCalendars.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import {
  createHolidayCalendar,
  getHolidayCalendarById,
  listHolidayCalendars,
  softDeleteHolidayCalendar,
  updateHolidayCalendar,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-3.7. A calendar is a company-wide record, not a per-team one — several
 * teams share it, and none of them owns it.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('holiday calendars', () => {
  useTestDatabase();

  it('creates a calendar carrying a name and nothing else', async () => {
    // D-33: no description, no timezone. The timezone the engine reads lives
    // on the shift, and a second one here is a source of drift with no reader.
    const calendar = await createHolidayCalendar(
      { name: 'India public holidays' },
      actor,
    );

    expect(calendar).toMatchObject({
      name: 'India public holidays',
      version: 1,
      deletedAt: null,
    });
    expect(calendar.timezone).toBeUndefined();
    expect((await listHolidayCalendars()).total).toBe(1);
  });

  it('refuses a calendar with no name', async () => {
    await expect(createHolidayCalendar({ name: '  ' }, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses a second live calendar with the same name', async () => {
    // Two calendars called "India" are indistinguishable in the picker that
    // assigns them (D-33).
    await createHolidayCalendar({ name: 'India' }, actor);

    await expect(
      createHolidayCalendar({ name: 'India' }, actor),
    ).rejects.toThrow(/already/i);
  });

  it('frees the name once a calendar is soft deleted', async () => {
    const first = await createHolidayCalendar({ name: 'India' }, actor);
    await softDeleteHolidayCalendar(
      String(first._id),
      { reason: 'Merged into the company calendar' },
      first.version,
      actor,
    );

    const second = await createHolidayCalendar({ name: 'India' }, actor);
    expect(second.name).toBe('India');
  });

  it('renames a calendar and bumps its version', async () => {
    const calendar = await createHolidayCalendar({ name: 'India' }, actor);
    const renamed = await updateHolidayCalendar(
      String(calendar._id),
      { name: 'India and Sri Lanka' },
      calendar.version,
      actor,
    );

    expect(renamed).toMatchObject({
      name: 'India and Sri Lanka',
      version: 2,
    });
  });

  it('answers null for an id that is not a calendar', async () => {
    expect(await getHolidayCalendarById('not-an-object-id')).toBeNull();
  });

  it('hides a soft deleted calendar unless it is asked for', async () => {
    const calendar = await createHolidayCalendar({ name: 'India' }, actor);
    await softDeleteHolidayCalendar(
      String(calendar._id),
      { reason: 'No longer used' },
      calendar.version,
      actor,
    );

    expect((await listHolidayCalendars()).total).toBe(0);
    expect((await listHolidayCalendars({ includeDeleted: true })).total).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run __tests__/database.holidayCalendars.test.js`
Expected: FAIL — `createHolidayCalendar is not a function`.

- [ ] **Step 3: Add the collection name**

In `constants/index.js`, in the `COLLECTIONS` object next to `HOLIDAYS`:

```javascript
  HOLIDAY_CALENDARS: 'holidayCalendars',
```

- [ ] **Step 4: Add the schema**

In `database.js`, immediately above `holidaySchema`:

```javascript
/**
 * FR-3.7. A calendar is company-wide and carries a name and nothing else
 * (`D-33`). The timezone the engine reads lives on the shift (`FR-3.10`,
 * `DC-5`); a second one here would be a source of drift with no reader.
 */
export const holidayCalendarSchema = z.object({
  name: z.string().trim().min(1, 'A name is required'),
});
```

- [ ] **Step 5: Add the index**

In `ensureIndexes`, above the `HOLIDAYS` index block:

```javascript
  await db.collection(COLLECTIONS.HOLIDAY_CALENDARS).createIndexes([
    /**
     * Unique among LIVE calendars only. Two calendars called "India" are
     * indistinguishable in the picker that assigns them, but a soft deleted
     * one must never block the name of its replacement.
     */
    {
      key: { companyId: 1, name: 1 },
      unique: true,
      partialFilterExpression: { deletedAt: null },
      name: 'holiday_calendar_one_live_name',
    },
  ]);
```

- [ ] **Step 6: Write the CRUD**

In `database.js`, a new section immediately above `// --- Holidays ---`:

```javascript
// --- Holiday calendars -----------------------------------------------------

/**
 * FR-3.7. Company-wide records that teams are assigned to. Two or three serve
 * the whole company; none is created automatically when a team is created.
 */
export async function listHolidayCalendars({
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.HOLIDAY_CALENDARS)
    .find(filter)
    .sort({ name: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

export async function getHolidayCalendarById(
  id,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  return db
    .collection(COLLECTIONS.HOLIDAY_CALENDARS)
    .findOne({ _id: new ObjectId(id), companyId });
}

export async function createHolidayCalendar(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(holidayCalendarSchema, input);
  const db = await getDb();

  const clash = await db
    .collection(COLLECTIONS.HOLIDAY_CALENDARS)
    .findOne({ companyId, name: data.name, deletedAt: null });

  if (clash) {
    throw new ValidationError(
      `A calendar called ${data.name} already exists. Edit that one rather than adding a second with the same name.`,
    );
  }

  return createOwnedRecord(COLLECTIONS.HOLIDAY_CALENDARS, {
    data,
    action: 'HOLIDAY_CALENDAR_CREATED',
    entityType: 'holidayCalendar',
    companyId,
    actor,
  });
}

export async function updateHolidayCalendar(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const before = await db
    .collection(COLLECTIONS.HOLIDAY_CALENDARS)
    .findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const data = parse(holidayCalendarSchema.partial(), patch);

  if (data.name && data.name !== before.name) {
    const clash = await db
      .collection(COLLECTIONS.HOLIDAY_CALENDARS)
      .findOne({ companyId, name: data.name, deletedAt: null });

    if (clash) {
      throw new ValidationError(
        `A calendar called ${data.name} already exists.`,
      );
    }
  }

  const after = await updateWithVersion(
    COLLECTIONS.HOLIDAY_CALENDARS,
    id,
    version,
    {
      $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'HOLIDAY_CALENDAR_UPDATED',
    entityType: 'holidayCalendar',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * Refused while any team is still assigned — `Task 4` adds that check. The
 * function is written here so the CRUD reads in one place; the guard arrives
 * with the assignment code that makes it meaningful.
 */
export async function softDeleteHolidayCalendar(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);

  return softDeleteOwnedRecord(COLLECTIONS.HOLIDAY_CALENDARS, {
    id,
    reason: data.reason,
    version,
    action: 'HOLIDAY_CALENDAR_SOFT_DELETED',
    entityType: 'holidayCalendar',
    companyId,
    actor,
  });
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run __tests__/database.holidayCalendars.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint:fix && npm run lint
git add constants/index.js database.js __tests__/database.holidayCalendars.test.js
git commit -m "feat: a holiday calendar is a company-wide record"
```

---

### Task 3: Holidays and the weekly off move onto the calendar

**Files:**
- Modify: `database.js` — `holidaySchema` (~line 250),
  `weeklyOffPatternSchema` (~line 261), the two index blocks (~line 517),
  `listHolidays` / `createHoliday` (~line 2924), `getWeeklyOffPattern` /
  `setWeeklyOffPattern` (~line 3038)
- Test: `__tests__/database.holidayCalendars.test.js` (append)
- Modify: `__tests__/database.teamPolicy.test.js` — its holiday and weekly-off
  tests now go through a calendar

**Interfaces:**
- Consumes: Task 2's `createHolidayCalendar`, `getHolidayCalendarById`.
- Produces:
  - `listCalendarHolidays(calendarId, { includeDeleted, companyId }) → { items, total }`
  - `getCalendarWeeklyOff(calendarId, companyId) → doc | null`
  - `setCalendarWeeklyOff(calendarId, input, version, actor, companyId) → doc`
  - `createHoliday(input, actor, companyId)` — `input.calendarId`, was `input.teamId`
  - `listHolidaysForTeam(teamId, { includeDeleted, companyId }) → { items, total }`
  - `getWeeklyOffPatternForTeam(teamId, companyId) → doc | null`

  `listHolidays` and `getWeeklyOffPattern` are **removed**. Every caller moves
  to one of the four names above, so no call site can silently keep the old
  per-team meaning.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/database.holidayCalendars.test.js`:

```javascript
describe('holidays and the weekly off belong to a calendar', () => {
  useTestDatabase();

  const calendar = () =>
    createHolidayCalendar({ name: 'India public holidays' }, actor);

  it('creates a holiday against a calendar, not a team', async () => {
    const india = await calendar();
    const holiday = await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    expect(holiday).toMatchObject({
      calendarId: String(india._id),
      date: '2026-08-14',
      version: 1,
    });
    expect(holiday.teamId).toBeUndefined();
    expect((await listCalendarHolidays(String(india._id))).total).toBe(1);
  });

  it('refuses a holiday with no calendar', async () => {
    await expect(
      createHoliday(
        { date: '2026-08-14', name: 'Independence Day', type: HOLIDAY_TYPE.PUBLIC },
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a second holiday on one date on one calendar', async () => {
    const india = await calendar();
    const input = {
      calendarId: String(india._id),
      date: '2026-08-14',
      name: 'Independence Day',
      type: HOLIDAY_TYPE.PUBLIC,
    };
    await createHoliday(input, actor);

    await expect(
      createHoliday({ ...input, name: 'Something else' }, actor),
    ).rejects.toThrow(/already observes/i);
  });

  it('lets two calendars observe different days on the same date', async () => {
    // FR-3.7 survives the move: the difference is now between calendars.
    const india = await calendar();
    const us = await createHolidayCalendar({ name: 'US public holidays' }, actor);

    await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    expect((await listCalendarHolidays(String(india._id))).total).toBe(1);
    expect((await listCalendarHolidays(String(us._id))).total).toBe(0);
  });

  it('sets a weekly off pattern on the calendar', async () => {
    const india = await calendar();
    const pattern = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0, 6] },
      null,
      actor,
    );

    expect(pattern).toMatchObject({
      calendarId: String(india._id),
      daysOfWeek: [0, 6],
      version: 1,
    });
    expect(pattern.teamId).toBeUndefined();
  });

  it('accepts an empty pattern, which is a real answer', async () => {
    // FR-3.8: a calendar whose teams work every day.
    const india = await calendar();
    const pattern = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [] },
      null,
      actor,
    );

    expect(pattern.daysOfWeek).toEqual([]);
    expect(await getCalendarWeeklyOff(String(india._id))).not.toBeNull();
  });

  it('replaces the pattern in place rather than adding a second', async () => {
    const india = await calendar();
    const first = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0] },
      null,
      actor,
    );
    const second = await setCalendarWeeklyOff(
      String(india._id),
      { daysOfWeek: [0, 6] },
      first.version,
      actor,
    );

    expect(second._id).toEqual(first._id);
    expect(second).toMatchObject({ daysOfWeek: [0, 6], version: 2 });
  });
});

describe('the team-facing read seam', () => {
  useTestDatabase();

  it('reads the assigned calendar’s holidays for a team', async () => {
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );
    await setCalendarWeeklyOff(String(india._id), { daysOfWeek: [0] }, null, actor);

    expect((await listHolidaysForTeam(String(general._id))).total).toBe(1);
    expect(
      (await getWeeklyOffPatternForTeam(String(general._id))).daysOfWeek,
    ).toEqual([0]);
  });

  it('reads nothing for a team with no calendar, and never a weekend', async () => {
    // D-29: no default calendar and no fallback. Defaulting to Saturday and
    // Sunday is the exact assumption FR-3.8 forbids.
    const general = await createTeam({ name: 'General' }, actor);

    expect(await listHolidaysForTeam(String(general._id))).toEqual({
      items: [],
      total: 0,
    });
    expect(await getWeeklyOffPatternForTeam(String(general._id))).toBeNull();
  });
});
```

Extend the import block at the top of the file to name `createHoliday`,
`createTeam`, `getCalendarWeeklyOff`, `getWeeklyOffPatternForTeam`,
`listCalendarHolidays`, `listHolidaysForTeam`, `setCalendarTeams` and
`setCalendarWeeklyOff`, and add
`import { HOLIDAY_TYPE } from '../constants/index.js';`.

`setCalendarTeams` arrives in Task 4 — these last two tests fail until then,
which is correct: they are the reason Task 4 exists.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run __tests__/database.holidayCalendars.test.js`
Expected: FAIL — `listCalendarHolidays is not a function`.

- [ ] **Step 3: Re-key the two schemas**

In `database.js`, replace `holidaySchema`'s first field and
`weeklyOffPatternSchema`'s doc comment:

```javascript
/** FR-3.7. Typed, so nothing about a calendar depends on formatting or colour. */
export const holidaySchema = z.object({
  calendarId: z.string().min(1, 'A holiday belongs to a calendar'),
  date: isoDate,
  name: z.string().trim().min(1, 'A name is required'),
  type: z.enum(Object.values(HOLIDAY_TYPE)),
});

/**
 * FR-3.8. Sunday is 0 through Saturday 6, matching `Date#getDay`. An empty
 * list is a real answer — a calendar whose teams work every day — so it is
 * accepted. The pattern belongs to the calendar, not the team (`D-28`).
 */
export const weeklyOffPatternSchema = z.object({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6, 'A day of week runs 0 to 6'))
    .refine((days) => new Set(days).size === days.length, {
      message: 'A day cannot be listed twice',
    }),
});
```

- [ ] **Step 4: Re-key the two indexes**

In `ensureIndexes`, replace the `HOLIDAYS` and `WEEKLY_OFF_PATTERNS` blocks:

```javascript
  await db
    .collection(COLLECTIONS.HOLIDAYS)
    .createIndexes([{ key: { companyId: 1, calendarId: 1, date: 1 } }]);

  await db
    .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
    .createIndexes([{ key: { companyId: 1, calendarId: 1 }, unique: true }]);
```

- [ ] **Step 5: Rewrite the holiday readers and writers**

Replace `listHolidays` with `listCalendarHolidays`, and change
`createHoliday`'s clash check:

```javascript
/** FR-3.7: one calendar's holidays, shared by every team assigned to it. */
export async function listCalendarHolidays(
  calendarId,
  { includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  if (!calendarId) return { items: [], total: 0 };

  const db = await getDb();
  const filter = { companyId, calendarId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.HOLIDAYS)
    .find(filter)
    .sort({ date: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}
```

Inside `createHoliday`, the clash query and message become:

```javascript
  const clash = await db.collection(COLLECTIONS.HOLIDAYS).findOne({
    companyId,
    calendarId: data.calendarId,
    date: data.date,
    deletedAt: null,
  });

  if (clash) {
    throw new ValidationError(
      `This calendar already observes ${clash.name} on ${data.date}. Edit that entry rather than adding a second one.`,
    );
  }
```

`updateHoliday` and `softDeleteHoliday` need no change — they work by `_id`.

- [ ] **Step 6: Rewrite the weekly off readers and writers**

Replace `getWeeklyOffPattern` and `setWeeklyOffPattern` wholesale:

```javascript
// --- Weekly off pattern ----------------------------------------------------

export async function getCalendarWeeklyOff(
  calendarId,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!calendarId) return null;

  const db = await getDb();
  return db
    .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
    .findOne({ companyId, calendarId });
}

/**
 * FR-3.8. Exactly one pattern per calendar, replaced in place.
 *
 * `version` is null the first time, when the calendar has no pattern yet — the
 * same shape `setPermissionGrant` uses for a cell with no row.
 */
export async function setCalendarWeeklyOff(
  calendarId,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(weeklyOffPatternSchema, input);
  const db = await getDb();
  const now = new Date();
  const before = await getCalendarWeeklyOff(calendarId, companyId);

  let after;

  if (!before) {
    const doc = {
      calendarId,
      daysOfWeek: data.daysOfWeek,
      companyId,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };

    const { insertedId } = await db
      .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
      .insertOne(doc);
    after = { ...doc, _id: insertedId };
  } else {
    after = await updateWithVersion(
      COLLECTIONS.WEEKLY_OFF_PATTERNS,
      String(before._id),
      version,
      {
        $set: {
          daysOfWeek: data.daysOfWeek,
          updatedAt: now,
          updatedBy: actor.userId,
        },
        $inc: { version: 1 },
      },
      companyId,
    );
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'WEEKLY_OFF_PATTERN_SET',
    entityType: 'weeklyOffPattern',
    entityId: after._id,
    before,
    after,
    reason: input.reason ?? null,
    companyId,
  });

  return after;
}
```

- [ ] **Step 7: Add the team-facing seam**

Immediately below `setCalendarWeeklyOff`:

```javascript
// --- The team-facing seam --------------------------------------------------

/**
 * `D-28`. The engine consumes `holidaysByTeam` and `weeklyOffByTeam` maps
 * keyed on the team a user held **on each date** — the keying that makes a
 * mid-period team move come out right (`FR-3.9`). These two resolve which
 * calendar a team is assigned to and delegate, so that keying survives the
 * move to shared calendars and no pure function changes.
 *
 * A team with no calendar reads as no holidays and no weekly off. Never a
 * weekend: `FR-3.8` exists to forbid exactly that assumption (`D-29`).
 */
export async function listHolidaysForTeam(
  teamId,
  { includeDeleted = false, companyId = DEFAULT_COMPANY_ID } = {},
) {
  const team = await getTeamById(teamId, companyId);
  return listCalendarHolidays(team?.calendarId ?? null, {
    includeDeleted,
    companyId,
  });
}

export async function getWeeklyOffPatternForTeam(
  teamId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const team = await getTeamById(teamId, companyId);
  return getCalendarWeeklyOff(team?.calendarId ?? null, companyId);
}
```

- [ ] **Step 8: Move `__tests__/database.teamPolicy.test.js` onto calendars**

Its `describe('holidays')` and `describe('weekly off')` blocks currently pass
`teamId`. Change each to create a calendar, assign the team to it via
`setCalendarTeams`, and assert through `listHolidaysForTeam` /
`getWeeklyOffPatternForTeam` — the behaviour under test (a team sees its
holidays) is unchanged, only the route to it. Update the import list.

- [ ] **Step 9: Run both test files**

Run: `npx vitest run __tests__/database.holidayCalendars.test.js __tests__/database.teamPolicy.test.js`
Expected: the seam tests naming `setCalendarTeams` still FAIL (Task 4 supplies
it); everything else PASSES.

- [ ] **Step 10: Commit**

```bash
npm run lint:fix && npm run lint
git add database.js __tests__/database.holidayCalendars.test.js __tests__/database.teamPolicy.test.js
git commit -m "feat: holidays and the weekly off hang off a calendar"
```

Other files still importing `listHolidays` / `getWeeklyOffPattern` are broken
at this point and are fixed in Task 5. That is deliberate — the compiler is the
checklist.

---

### Task 4: Assigning teams, and refusing to delete an assigned calendar

**Files:**
- Modify: `database.js` — `teamSchema` (~line 215), assignment + delete guard
  in the Holiday calendars section
- Test: `__tests__/database.holidayCalendars.test.js` (append)

**Interfaces:**
- Consumes: Task 2's CRUD, Task 3's seam.
- Produces:
  - `listTeamsOnCalendar(calendarId, companyId) → [team]`
  - `setCalendarTeams(calendarId, teamIds, actor, companyId) → { joined: [teamId], left: [teamId] }`
  - `softDeleteHolidayCalendar` now throws `ValidationError` while assigned.

  `joined` and `left` are what the route fans `recalculateDays` over — the
  route must recalculate both, because the day type of every date changes for
  a team leaving as surely as for one joining (`D-31`).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/database.holidayCalendars.test.js`:

```javascript
describe('assigning teams to a calendar', () => {
  useTestDatabase();

  const setUp = async () => ({
    india: await createHolidayCalendar({ name: 'India' }, actor),
    us: await createHolidayCalendar({ name: 'US' }, actor),
    general: await createTeam({ name: 'General' }, actor),
    support: await createTeam({ name: 'Support' }, actor),
  });

  it('assigns teams and reports which joined', async () => {
    const { india, general, support } = await setUp();

    const result = await setCalendarTeams(
      String(india._id),
      [String(general._id), String(support._id)],
      actor,
    );

    expect(result.joined.sort()).toEqual(
      [String(general._id), String(support._id)].sort(),
    );
    expect(result.left).toEqual([]);
    expect((await listTeamsOnCalendar(String(india._id))).length).toBe(2);
  });

  it('reports the teams that left when they are omitted', async () => {
    const { india, general, support } = await setUp();
    await setCalendarTeams(
      String(india._id),
      [String(general._id), String(support._id)],
      actor,
    );

    const result = await setCalendarTeams(
      String(india._id),
      [String(general._id)],
      actor,
    );

    expect(result.joined).toEqual([]);
    expect(result.left).toEqual([String(support._id)]);
    expect(
      (await getTeamById(String(support._id))).calendarId,
    ).toBeNull();
  });

  it('moves a team off the calendar it was on', async () => {
    // A team holds at most one calendar, and single-valued storage makes that
    // unbreakable rather than merely enforced (D-31).
    const { india, us, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);
    await setCalendarTeams(String(us._id), [String(general._id)], actor);

    expect((await listTeamsOnCalendar(String(india._id))).length).toBe(0);
    expect((await getTeamById(String(general._id))).calendarId).toBe(
      String(us._id),
    );
  });

  it('is a no-op given the list it already holds', async () => {
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const result = await setCalendarTeams(
      String(india._id),
      [String(general._id)],
      actor,
    );

    expect(result).toEqual({ joined: [], left: [] });
  });

  it('refuses to soft delete a calendar while a team is assigned', async () => {
    // D-30: one click, and every team on it loses its working week at once.
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    await expect(
      softDeleteHolidayCalendar(
        String(india._id),
        { reason: 'No longer used' },
        india.version,
        actor,
      ),
    ).rejects.toThrow(/General/);
  });

  it('permits the delete once no team is assigned', async () => {
    const { india, general } = await setUp();
    await setCalendarTeams(String(india._id), [String(general._id)], actor);
    await setCalendarTeams(String(india._id), [], actor);

    const removed = await softDeleteHolidayCalendar(
      String(india._id),
      { reason: 'Merged into the company calendar' },
      india.version,
      actor,
    );

    expect(removed.deletedAt).not.toBeNull();
  });
});
```

Add `getTeamById` and `listTeamsOnCalendar` to the import list.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.holidayCalendars.test.js`
Expected: FAIL — `setCalendarTeams is not a function`.

- [ ] **Step 3: Let a team carry a calendar**

In `database.js`, `teamSchema`:

```javascript
export const teamSchema = z.object({
  name: z.string().trim().min(1, 'A name is required'),
  managerId: z.string().nullable().optional(),
  defaultShiftId: z.string().nullable().optional(),
  /**
   * FR-3.7. The calendar this team observes, assigned on `S-26`. Nullable and
   * never defaulted — a team with none is an outstanding value on the S-05
   * queue, not a team that quietly works Monday to Friday (`D-29`).
   */
  calendarId: z.string().nullable().optional(),
});
```

- [ ] **Step 4: Add the index on the team's calendar**

In `ensureIndexes`, in the `TEAMS` index block, add:

```javascript
    { key: { companyId: 1, calendarId: 1 } },
```

- [ ] **Step 5: Write the assignment**

In the Holiday calendars section, below `updateHolidayCalendar`:

```javascript
/** Every live team currently observing this calendar. */
export async function listTeamsOnCalendar(
  calendarId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  return db
    .collection(COLLECTIONS.TEAMS)
    .find({ companyId, calendarId, deletedAt: null })
    .sort({ name: 1, _id: 1 })
    .toArray();
}

/**
 * `D-31`. The full list of teams this calendar serves, reconciled: teams named
 * but not currently assigned join, teams currently assigned but not named
 * leave, and a team already on another calendar is moved.
 *
 * Returns both sides because the caller has to recalculate both. A team
 * leaving loses the holidays and the weekly off it was classified against, so
 * its day types change exactly as much as a joining team's do.
 */
export async function setCalendarTeams(
  calendarId,
  teamIds,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const wanted = [...new Set(teamIds ?? [])].filter(Boolean);

  const current = (await listTeamsOnCalendar(calendarId, companyId)).map(
    (team) => String(team._id),
  );

  const joined = wanted.filter((id) => !current.includes(id));
  const left = current.filter((id) => !wanted.includes(id));

  if (joined.length === 0 && left.length === 0) return { joined: [], left: [] };

  const now = new Date();

  for (const [ids, value] of [
    [joined, calendarId],
    [left, null],
  ]) {
    if (ids.length === 0) continue;

    const before = await db
      .collection(COLLECTIONS.TEAMS)
      .find({ companyId, _id: { $in: ids.map((id) => new ObjectId(id)) } })
      .toArray();

    await db.collection(COLLECTIONS.TEAMS).updateMany(
      { companyId, _id: { $in: ids.map((id) => new ObjectId(id)) } },
      {
        $set: { calendarId: value, updatedAt: now, updatedBy: actor.userId },
        $inc: { version: 1 },
      },
    );

    for (const team of before) {
      await writeAuditRecord({
        actorId: actor.userId,
        actorName: actor.name,
        action: 'TEAM_CALENDAR_ASSIGNED',
        entityType: 'team',
        entityId: String(team._id),
        before: team,
        after: { ...team, calendarId: value, version: team.version + 1 },
        companyId,
      });
    }
  }

  return { joined, left };
}
```

- [ ] **Step 6: Guard the delete**

At the top of `softDeleteHolidayCalendar`, before `parse`:

```javascript
  const assigned = await listTeamsOnCalendar(id, companyId);

  if (assigned.length > 0) {
    const names = assigned.map((team) => team.name).join(', ');
    throw new ValidationError(
      `${names} ${assigned.length === 1 ? 'is' : 'are'} still assigned to this calendar. Move ${assigned.length === 1 ? 'it' : 'them'} to another calendar first — removing this one would leave ${assigned.length === 1 ? 'that team' : 'those teams'} with no working week at all.`,
    );
  }
```

- [ ] **Step 7: Run the whole file**

Run: `npx vitest run __tests__/database.holidayCalendars.test.js`
Expected: PASS — every test, the Task 3 seam tests included.

- [ ] **Step 8: Commit**

```bash
npm run lint:fix && npm run lint
git add database.js __tests__/database.holidayCalendars.test.js
git commit -m "feat: teams are assigned to a calendar, and an assigned one cannot be removed"
```

---

### Task 5: Re-point every reader, and `getTeamConfiguration`

Task 3 deliberately broke the callers. This fixes them all.

**Files:**
- Modify: `database.js` — `getTeamConfiguration` (~line 3200),
  `loadRecalculationInputs` (~line 4568)
- Modify: `engine/reports.js` — `calendarInputsFor` (line 30),
  `TeamCalendarCache` (line 217)
- Test: `__tests__/database.recalculationInputs.test.js`,
  `__tests__/engine.reports.test.js` — update, do not rewrite

**Interfaces:**
- Consumes: `listHolidaysForTeam`, `getWeeklyOffPatternForTeam`,
  `listCalendarHolidays`, `getCalendarWeeklyOff`, `getHolidayCalendarById`.
- Produces: `getTeamConfiguration` now returns
  `{ team, shifts, calendar, holidays, weeklyOffPattern, policy, gaps }`,
  where `calendar` is the assigned calendar document or `null`. `holidays` and
  `weeklyOffPattern` remain, read through the calendar, so `S-17` renders them
  read-only without a second fetch.

- [ ] **Step 1: Find every broken caller**

Run: `npx vitest run 2>&1 | head -40`
Expected: failures naming `listHolidays` / `getWeeklyOffPattern`.

Confirm the list:

```bash
grep -rn "listHolidays\b\|getWeeklyOffPattern\b" --include=*.js . \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.claude
```

- [ ] **Step 2: Re-point `getTeamConfiguration`**

```javascript
export async function getTeamConfiguration(
  teamId,
  companyId = DEFAULT_COMPANY_ID,
) {
  const team = await getTeamById(teamId, companyId);
  if (!team) return null;

  const calendar = team.calendarId
    ? await getHolidayCalendarById(team.calendarId, companyId)
    : null;

  const [shifts, holidays, weeklyOffPattern, policy] = await Promise.all([
    listShifts(teamId, { companyId }),
    listCalendarHolidays(team.calendarId ?? null, { companyId }),
    getCalendarWeeklyOff(team.calendarId ?? null, companyId),
    getTeamPolicy(teamId, companyId),
  ]);

  return {
    team,
    shifts: shifts.items,
    calendar,
    holidays: holidays.items,
    weeklyOffPattern,
    policy,
    gaps: missingConfiguration({
      team,
      shifts: shifts.items,
      calendar,
      weeklyOffPattern,
      policy,
    }),
  };
}
```

Update its doc comment: the calendar and the pattern are read through the
team's assignment and are read-only on `S-17`, owned by `S-26`.

- [ ] **Step 3: Re-point `loadRecalculationInputs`**

Replace the two lines in its per-team loop:

```javascript
    holidaysByTeam[teamId] = (
      await listHolidaysForTeam(teamId, { companyId })
    ).items;
    weeklyOffByTeam[teamId] = await getWeeklyOffPatternForTeam(
      teamId,
      companyId,
    );
```

- [ ] **Step 4: Re-point `engine/reports.js`**

Change the import to `getWeeklyOffPatternForTeam` and `listHolidaysForTeam`,
and in `calendarInputsFor`:

```javascript
  for (const teamId of teamIds) {
    holidaysByTeam[teamId] = (await listHolidaysForTeam(teamId)).items;
    weeklyOffByTeam[teamId] = await getWeeklyOffPatternForTeam(teamId);
  }
```

- [ ] **Step 5: Re-key `TeamCalendarCache` on the calendar**

Two or three calendars serve fifteen to twenty teams, so caching per team
re-reads the same calendar many times over. Cache the calendar and fan out:

```javascript
/**
 * The holidays and weekly-off pattern behind each team, read once per
 * CALENDAR however many teams share it and however many colleagues sit on
 * them. Twenty teams over three calendars is three pairs of reads, not twenty.
 *
 * The cache lives for one build and is thrown away with it — holding it longer
 * would serve a stale calendar to the next request, which is the bug
 * `README.md` warns about for permission grants for the same reason.
 */
class TeamCalendarCache {
  #calendarIdByTeam = new Map();
  #holidays = new Map();
  #weeklyOff = new Map();

  async forTeams(teamIds) {
    const holidaysByTeam = {};
    const weeklyOffByTeam = {};

    for (const teamId of new Set(teamIds.filter(Boolean))) {
      if (!this.#calendarIdByTeam.has(teamId)) {
        const team = await getTeamById(teamId);
        this.#calendarIdByTeam.set(teamId, team?.calendarId ?? null);
      }

      const calendarId = this.#calendarIdByTeam.get(teamId);

      if (!this.#holidays.has(calendarId)) {
        this.#holidays.set(
          calendarId,
          (await listCalendarHolidays(calendarId)).items,
        );
        this.#weeklyOff.set(calendarId, await getCalendarWeeklyOff(calendarId));
      }

      holidaysByTeam[teamId] = this.#holidays.get(calendarId);
      weeklyOffByTeam[teamId] = this.#weeklyOff.get(calendarId);
    }

    return { holidaysByTeam, weeklyOffByTeam };
  }
}
```

Import `getCalendarWeeklyOff`, `getTeamById` and `listCalendarHolidays` from
`../database.js`.

Note `listCalendarHolidays(null)` and `getCalendarWeeklyOff(null)` return
`{ items: [], total: 0 }` and `null` — so a team with no calendar is cached
once under the `null` key rather than re-read per team.

- [ ] **Step 6: Update the affected tests**

`__tests__/database.recalculationInputs.test.js` and
`__tests__/engine.reports.test.js` build their fixtures with per-team holidays.
Change each to create a calendar, assign the team with `setCalendarTeams`, and
put the holidays on the calendar. The assertions — which day types come out,
which counts — must not change. If an assertion has to change, the fixture is
wrong, not the engine.

Add one test to `__tests__/engine.reports.test.js`:

```javascript
  it('counts working days from the calendar the team is assigned to', async () => {
    // D-28: the engine still keys on the team; only the loader resolves which
    // calendar that team observes.
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);
    await setCalendarWeeklyOff(String(india._id), { daysOfWeek: [0, 6] }, null, actor);
    await createHoliday(
      {
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      },
      actor,
    );

    // …build the user on `general`, run the annual summary for August 2026,
    // and assert holidays: 1 and the weekly-off count for that month.
  });
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS. Any remaining failure names a caller Step 1's grep missed.

- [ ] **Step 8: Commit**

```bash
npm run lint:fix && npm run lint
git add database.js engine/reports.js __tests__/
git commit -m "feat: every reader resolves the team's calendar"
```

---

### Task 6: The migration, and the seed

**Files:**
- Modify: `database.js` — `migrateTeamCalendars` next to
  `migrateLegacyTeamKeys` (~line 6006)
- Modify: `scripts/seed.js` — holidays and patterns seed onto calendars; call
  the migration before `ensureIndexes`
- Test: `__tests__/database.holidayCalendarMigration.test.js`

**Interfaces:**
- Consumes: Task 2's CRUD, Task 4's assignment.
- Produces: `migrateTeamCalendars(actor, companyId) → { calendarsCreated, holidaysMoved, patternsMoved, teamsAssigned }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/database.holidayCalendarMigration.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, HOLIDAY_TYPE } from '../constants/index.js';
import {
  createTeam,
  getDb,
  getTeamById,
  getWeeklyOffPatternForTeam,
  listHolidayCalendars,
  listHolidaysForTeam,
  migrateTeamCalendars,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * D-34. Records written while a calendar belonged to a team keep working the
 * day the shared-calendar change ships. Nothing is merged automatically — four
 * seeded teams observe deliberately different days, and a script cannot know
 * which of those differences were intentional.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

/** A holiday and a pattern in the old per-team shape, written straight in. */
const legacyRecords = async (teamId) => {
  const db = await getDb();
  await db.collection(COLLECTIONS.HOLIDAYS).insertOne({
    teamId,
    date: '2026-08-14',
    name: 'Independence Day',
    type: HOLIDAY_TYPE.PUBLIC,
    companyId: 'pulse',
    deletedAt: null,
    version: 1,
  });
  await db.collection(COLLECTIONS.WEEKLY_OFF_PATTERNS).insertOne({
    teamId,
    daysOfWeek: [0, 6],
    companyId: 'pulse',
    version: 1,
  });
};

describe('migrating per-team calendars', () => {
  useTestDatabase();

  it('creates one calendar per team and moves its records onto it', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    await legacyRecords(String(general._id));

    const result = await migrateTeamCalendars(actor);

    expect(result).toMatchObject({
      calendarsCreated: 1,
      holidaysMoved: 1,
      patternsMoved: 1,
      teamsAssigned: 1,
    });

    const [calendar] = (await listHolidayCalendars()).items;
    expect(calendar.name).toBe('General calendar');
    expect((await getTeamById(String(general._id))).calendarId).toBe(
      String(calendar._id),
    );
    expect((await listHolidaysForTeam(String(general._id))).total).toBe(1);
    expect(
      (await getWeeklyOffPatternForTeam(String(general._id))).daysOfWeek,
    ).toEqual([0, 6]);
  });

  it('keeps two teams apart rather than merging them', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    const support = await createTeam({ name: 'Support' }, actor);
    await legacyRecords(String(general._id));
    await legacyRecords(String(support._id));

    await migrateTeamCalendars(actor);

    expect((await listHolidayCalendars()).total).toBe(2);
  });

  it('creates nothing for a team holding neither', async () => {
    await createTeam({ name: 'General' }, actor);

    expect(await migrateTeamCalendars(actor)).toMatchObject({
      calendarsCreated: 0,
      teamsAssigned: 0,
    });
    expect((await listHolidayCalendars()).total).toBe(0);
  });

  it('is idempotent', async () => {
    const general = await createTeam({ name: 'General' }, actor);
    await legacyRecords(String(general._id));

    await migrateTeamCalendars(actor);
    const second = await migrateTeamCalendars(actor);

    expect(second).toMatchObject({
      calendarsCreated: 0,
      holidaysMoved: 0,
      patternsMoved: 0,
    });
    expect((await listHolidayCalendars()).total).toBe(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/database.holidayCalendarMigration.test.js`
Expected: FAIL — `migrateTeamCalendars is not a function`.

- [ ] **Step 3: Write the migration**

In `database.js`, immediately below `migrateLegacyTeamKeys`:

```javascript
/**
 * `D-34`. One-shot move of the per-team calendars written before `FR-3.7`
 * made a calendar a company-wide record.
 *
 * For each team holding at least one holiday or a weekly off pattern it
 * creates `<Team name> calendar`, stamps `calendarId` on those records, and
 * assigns the team. Nothing is merged: four seeded teams observe deliberately
 * different days, and a script cannot know which of those differences were
 * intentional. Administrators merge down to two or three on `S-26`.
 *
 * Runs BEFORE `ensureIndexes`, for the same reason `migrateLegacyTeamKeys`
 * does: the unique index on `(companyId, calendarId)` cannot build while
 * several patterns still share a null one.
 *
 * Idempotent — after one run no holiday or pattern carries `teamId`, so the
 * filters match nothing.
 */
export async function migrateTeamCalendars(
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const db = await getDb();
  const counts = {
    calendarsCreated: 0,
    holidaysMoved: 0,
    patternsMoved: 0,
    teamsAssigned: 0,
  };

  const teamIds = [
    ...new Set([
      ...(await db
        .collection(COLLECTIONS.HOLIDAYS)
        .distinct('teamId', { companyId, teamId: { $type: 'string' } })),
      ...(await db
        .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
        .distinct('teamId', { companyId, teamId: { $type: 'string' } })),
    ]),
  ].filter(Boolean);

  for (const teamId of teamIds) {
    const team = await getTeamById(teamId, companyId);
    if (!team) continue;

    const calendar = await createHolidayCalendar(
      { name: `${team.name} calendar` },
      actor,
      companyId,
    );
    counts.calendarsCreated += 1;

    const calendarId = String(calendar._id);

    const holidays = await db
      .collection(COLLECTIONS.HOLIDAYS)
      .updateMany(
        { companyId, teamId },
        { $set: { calendarId }, $unset: { teamId: '' } },
      );
    counts.holidaysMoved += holidays.modifiedCount;

    const patterns = await db
      .collection(COLLECTIONS.WEEKLY_OFF_PATTERNS)
      .updateMany(
        { companyId, teamId },
        { $set: { calendarId }, $unset: { teamId: '' } },
      );
    counts.patternsMoved += patterns.modifiedCount;

    const { joined } = await setCalendarTeams(
      calendarId,
      [teamId],
      actor,
      companyId,
    );
    counts.teamsAssigned += joined.length;
  }

  return counts;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run __tests__/database.holidayCalendarMigration.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the seed**

In `scripts/seed.js`:

1. Call `migrateTeamCalendars(seedActor)` immediately before `ensureIndexes`,
   alongside `migrateLegacyTeamKeys`, and log its counts.
2. Replace the `const holidays = [...]` `teamKey` grouping with a
   `const holidayCalendars = [...]` list — one calendar per distinct set of
   observed days in the current seed — each holding its own holidays and its
   own `daysOfWeek`, plus the team keys it serves.
3. Upsert the calendars (keyed on `key`, like teams and shifts), read their ids
   back with `getSeedIdsByKey(COLLECTIONS.HOLIDAY_CALENDARS)`, then upsert the
   holidays and patterns with `calendarId`, and set each team's `calendarId`.

Keep the seed idempotent, and keep the deliberate difference between the seeded
teams — that difference is an MVP criterion, not an accident.

- [ ] **Step 6: Run the seed against a scratch database**

```bash
npm run seed && npm run seed
```

Expected: both runs succeed, the second reporting nothing created.

- [ ] **Step 7: Commit**

```bash
npm run lint:fix && npm run lint
git add database.js scripts/seed.js __tests__/database.holidayCalendarMigration.test.js
git commit -m "feat: existing per-team calendars migrate to shared ones"
```

---

### Task 7: The configuration gap splits in two

**Files:**
- Modify: `utils/policyCompleteness.js` — `missingConfiguration` (line ~81)
- Test: `utils/__tests__/policyCompleteness.test.js`

**Interfaces:**
- Consumes: Task 5's `getTeamConfiguration`, which now passes `calendar`.
- Produces: `missingConfiguration({ team, shifts, calendar, weeklyOffPattern, policy })`
  — `weeklyOffPattern` keeps its name and meaning; `calendar` is new.

- [ ] **Step 1: Write the failing test**

Add to `utils/__tests__/policyCompleteness.test.js`:

```javascript
  it('reports a team with no calendar assigned', () => {
    // D-29: never defaulted. There is no default calendar, and falling back to
    // Saturday and Sunday is the assumption FR-3.8 exists to forbid.
    const gaps = missingConfiguration({
      team: { name: 'General' },
      calendar: null,
      weeklyOffPattern: null,
    });

    expect(gaps).toContainEqual(
      expect.objectContaining({ entity: 'General', field: 'calendarId' }),
    );
  });

  it('attributes a missing weekly off to the calendar, not the team', () => {
    const gaps = missingConfiguration({
      team: { name: 'General' },
      calendar: { name: 'India' },
      weeklyOffPattern: null,
    });

    expect(gaps).toContainEqual(
      expect.objectContaining({
        entity: 'Calendar India',
        field: 'weeklyOffPattern',
      }),
    );
    expect(gaps).not.toContainEqual(
      expect.objectContaining({ field: 'calendarId' }),
    );
  });

  it('treats an empty weekly off as answered', () => {
    // A calendar whose teams work every day is a real answer (FR-3.8).
    const gaps = missingConfiguration({
      team: { name: 'General' },
      calendar: { name: 'India' },
      weeklyOffPattern: { daysOfWeek: [] },
    });

    expect(gaps).not.toContainEqual(
      expect.objectContaining({ field: 'weeklyOffPattern' }),
    );
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run utils/__tests__/policyCompleteness.test.js`
Expected: FAIL — no gap with field `calendarId`.

- [ ] **Step 3: Split the gap**

In `utils/policyCompleteness.js`, replace the weekly-off block:

```javascript
  /**
   * FR-3.7 and FR-3.8. Two distinct causes with two distinct fixes, so two
   * distinct gaps: a team observing no calendar at all, and a calendar that
   * has never said which days are non-working. Neither is defaulted — a
   * fallback to Saturday and Sunday is the assumption FR-3.8 forbids (`D-29`).
   *
   * An empty `daysOfWeek` is a real answer — a calendar whose teams work every
   * day — so only the absence of a pattern counts.
   */
  if (!calendar) {
    add(
      teamName,
      'calendarId',
      'A team observes the holidays and the weekly off of the calendar it is assigned to, and this team is assigned to none.',
    );
  } else if (
    !weeklyOffPattern ||
    !Array.isArray(weeklyOffPattern.daysOfWeek)
  ) {
    add(
      `Calendar ${calendar.name}`,
      'weeklyOffPattern',
      'Which days are non-working is not assumed to be Saturday and Sunday.',
    );
  }
```

Add `calendar` to the destructured parameter list.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run utils/__tests__/policyCompleteness.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint:fix && npm run lint
git add utils/policyCompleteness.js utils/__tests__/policyCompleteness.test.js
git commit -m "feat: an unassigned calendar is an outstanding value"
```

---

### Task 8: The API, contracts first

**Files:**
- Create: `app/api/holiday-calendars/route.js`,
  `app/api/holiday-calendars/[id]/route.js`,
  `app/api/holiday-calendars/[id]/soft-delete/route.js`,
  `app/api/holiday-calendars/[id]/teams/route.js`,
  `app/api/holiday-calendars/[id]/weekly-off/route.js`
- Modify: `app/api/holidays/route.js`, `app/api/holidays/[id]/route.js`,
  `app/api/holidays/[id]/soft-delete/route.js`
- Delete: `app/api/teams/[id]/weekly-off/route.js`
- Modify: `authz/routes.js`
- Test: `__tests__/api.holidayCalendars.test.js`; amend
  `__tests__/api.teams.test.js`

**Interfaces:**
- Consumes: every `database.js` function from Tasks 2–4;
  `recalculateDays(userId, { from, to }, { teamId })` from
  `engine/recalculate.js`.
- Produces the contract the Task 9 hook consumes:

| Method + path | Body | 200/201 | Errors |
| --- | --- | --- | --- |
| `GET /api/holiday-calendars` | — | `{ items, total }`, each item carrying `teams: [{ _id, name }]` | 401, 403 |
| `POST /api/holiday-calendars` | `{ name }` | the calendar, 201 | 400 `{ error }`, 401, 403 |
| `PATCH /api/holiday-calendars/[id]` | `{ name, version }` | the calendar | 400, 404, 409 |
| `POST /api/holiday-calendars/[id]/soft-delete` | `{ reason, version }` | the calendar | 400 while assigned, 404, 409 |
| `PUT /api/holiday-calendars/[id]/teams` | `{ teamIds: [] }` | `{ joined, left }` | 400, 404 |
| `PUT /api/holiday-calendars/[id]/weekly-off` | `{ daysOfWeek: [], version }` | the pattern | 400, 409 |
| `GET /api/holidays?calendarId=` | — | `{ items, total }` | 400 with no `calendarId` |
| `POST /api/holidays` | `{ calendarId, date, name, type }` | the holiday, 201 | 400 |

- [ ] **Step 1: Write the failing contract tests**

Create `__tests__/api.holidayCalendars.test.js`, modelled on
`__tests__/api.teams.test.js`. Cover, at minimum:

```javascript
import { describe, expect, it, vi } from 'vitest';
import { HOLIDAY_TYPE, PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import {
  createHolidayCalendar,
  createTeam,
  setCalendarTeams,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));
vi.mock('../engine/recalculate.js', () => ({
  recalculateDays: vi.fn().mockResolvedValue({ updated: 0 }),
}));

const { getSessionUser } = await import('../session.js');
const { recalculateDays } = await import('../engine/recalculate.js');
const calendarsRoute = await import('../app/api/holiday-calendars/route.js');
const calendarRoute = await import('../app/api/holiday-calendars/[id]/route.js');
const deleteRoute = await import(
  '../app/api/holiday-calendars/[id]/soft-delete/route.js'
);
const teamsRoute = await import(
  '../app/api/holiday-calendars/[id]/teams/route.js'
);
const weeklyOffRoute = await import(
  '../app/api/holiday-calendars/[id]/weekly-off/route.js'
);
const holidaysRoute = await import('../app/api/holidays/route.js');

const held = (...names) =>
  Object.fromEntries(names.map((name) => [name, SCOPES.ALL]));

const signedInAs = (permissions) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Office Administrator',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
  });

const admin = () =>
  signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

const actor = { userId: 'actor-1', name: 'Office Administrator' };
const params = (id) => ({ params: Promise.resolve({ id }) });

const request = (body, method = 'POST') =>
  new Request('http://localhost/api/holiday-calendars', {
    method,
    body: JSON.stringify(body),
  });

describe('/api/holiday-calendars', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await calendarsRoute.GET(request({}, 'GET'))).status).toBe(401);
  });

  it('answers 403 to a reader holding no config.read', async () => {
    signedInAs(held(PERMISSIONS.TEAM_READ));
    expect((await calendarsRoute.GET(request({}, 'GET'))).status).toBe(403);
  });

  it('lists calendars with the teams assigned to each', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const response = await calendarsRoute.GET(request({}, 'GET'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].teams).toEqual([
      { _id: String(general._id), name: 'General' },
    ]);
  });

  it('creates a calendar for a writer, and answers 201', async () => {
    admin();
    const response = await calendarsRoute.POST(request({ name: 'India' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'India', version: 1 });
  });

  it('answers 403 to a reader trying to create one', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    expect((await calendarsRoute.POST(request({ name: 'India' }))).status).toBe(
      403,
    );
  });

  it('answers 400 with the reason when the name is taken', async () => {
    admin();
    await createHolidayCalendar({ name: 'India' }, actor);

    const response = await calendarsRoute.POST(request({ name: 'India' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/already exists/i);
  });
});

describe('PUT /api/holiday-calendars/[id]/teams', () => {
  useTestDatabase();

  it('recalculates both the team joining and the team leaving', async () => {
    // D-31. A team leaving loses the holidays it was classified against, so
    // its day types change exactly as much as a joining team's do.
    admin();
    recalculateDays.mockClear();

    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    const support = await createTeam({ name: 'Support' }, actor);
    await setCalendarTeams(String(india._id), [String(support._id)], actor);

    const response = await teamsRoute.PUT(
      request({ teamIds: [String(general._id)] }, 'PUT'),
      params(String(india._id)),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      joined: [String(general._id)],
      left: [String(support._id)],
    });

    const recalculated = recalculateDays.mock.calls.map(
      ([, , options]) => options.teamId,
    );
    expect(recalculated.sort()).toEqual(
      [String(general._id), String(support._id)].sort(),
    );
  });
});

describe('POST /api/holiday-calendars/[id]/soft-delete', () => {
  useTestDatabase();

  it('answers 400 naming the teams while any is assigned', async () => {
    admin();
    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const response = await deleteRoute.POST(
      request({ reason: 'Merging', version: india.version }),
      params(String(india._id)),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/General/);
  });
});

describe('a calendar mutation fans out over every assigned team', () => {
  useTestDatabase();

  it('recalculates each assigned team when a holiday is added', async () => {
    admin();
    recalculateDays.mockClear();

    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    const support = await createTeam({ name: 'Support' }, actor);
    await setCalendarTeams(
      String(india._id),
      [String(general._id), String(support._id)],
      actor,
    );

    await holidaysRoute.POST(
      request({
        calendarId: String(india._id),
        date: '2026-08-14',
        name: 'Independence Day',
        type: HOLIDAY_TYPE.PUBLIC,
      }),
    );

    expect(recalculateDays).toHaveBeenCalledTimes(2);
  });

  it('recalculates each assigned team when the weekly off changes', async () => {
    admin();
    recalculateDays.mockClear();

    const india = await createHolidayCalendar({ name: 'India' }, actor);
    const general = await createTeam({ name: 'General' }, actor);
    await setCalendarTeams(String(india._id), [String(general._id)], actor);

    const response = await weeklyOffRoute.PUT(
      request({ daysOfWeek: [0, 6], version: null }, 'PUT'),
      params(String(india._id)),
    );

    expect(response.status).toBe(200);
    expect(recalculateDays).toHaveBeenCalledWith(
      null,
      { from: null, to: null },
      { teamId: String(general._id) },
    );
  });
});

describe('GET /api/holidays', () => {
  useTestDatabase();

  it('answers 400 without a calendarId', async () => {
    admin();
    const response = await holidaysRoute.GET(
      new Request('http://localhost/api/holidays'),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/calendar/i);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run __tests__/api.holidayCalendars.test.js`
Expected: FAIL — cannot resolve `app/api/holiday-calendars/route.js`.

- [ ] **Step 3: Write the collection route**

Create `app/api/holiday-calendars/route.js`:

```javascript
import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  createHolidayCalendar,
  listHolidayCalendars,
  listTeamsOnCalendar,
} from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * `S-26`, `FR-3.7`. Calendars are company-wide records that teams are assigned
 * to, shared across teams, and never created automatically when a team is.
 *
 * Each item carries the teams currently assigned, because the screen's whole
 * job is deciding which calendar a team belongs on — a list that did not say
 * would need a second request per calendar to be usable.
 */
export async function GET(_request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { items, total } = await listHolidayCalendars();

    const withTeams = await Promise.all(
      items.map(async (calendar) => ({
        ...calendar,
        teams: (await listTeamsOnCalendar(String(calendar._id))).map(
          (team) => ({ _id: String(team._id), name: team.name }),
        ),
      })),
    );

    return NextResponse.json({ items: withTeams, total });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const created = await createHolidayCalendar(await request.json(), actor);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 4: Write the rename and delete routes**

`app/api/holiday-calendars/[id]/route.js` — `PATCH`, asserting
`CONFIG_WRITE`, calling `updateHolidayCalendar(id, patch, version, actor)`,
answering 404 on null. A rename changes no date, so it triggers no
recalculation; say so in the doc comment.

`app/api/holiday-calendars/[id]/soft-delete/route.js` — `POST`, asserting
`CONFIG_WRITE`, calling `softDeleteHolidayCalendar(id, body, version, actor)`.
The `ValidationError` thrown while teams are assigned becomes a 400 through
`errorResponse` with no special handling. No recalculation: a calendar with no
team assigned classifies nothing.

- [ ] **Step 5: Write the assignment route**

Create `app/api/holiday-calendars/[id]/teams/route.js`:

```javascript
import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  COMPANY_WIDE,
  requireActor,
} from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import {
  getHolidayCalendarById,
  setCalendarTeams,
} from '../../../../../database.js';
import { recalculateDays } from '../../../../../engine/recalculate.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';

/**
 * `D-31`. The full list of teams this calendar serves, reconciled in one
 * write. A team already on another calendar is moved: a team holds at most one
 * calendar, and `teams.calendarId` being single-valued makes that unbreakable
 * rather than merely enforced.
 *
 * Both sides recalculate. A team leaving loses the holidays and the weekly off
 * it was classified against, so the day type of every one of its dates changes
 * exactly as much as a joining team's does.
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const calendar = await getHolidayCalendarById(id);
    if (!calendar) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const { teamIds } = await request.json();
    const { joined, left } = await setCalendarTeams(id, teamIds, actor);

    for (const teamId of [...joined, ...left]) {
      await recalculateDays(null, { from: null, to: null }, { teamId });
    }

    return NextResponse.json({ joined, left });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 6: Write the weekly-off route and delete the team's**

Create `app/api/holiday-calendars/[id]/weekly-off/route.js` with `GET` and
`PUT`, the body of the old `app/api/teams/[id]/weekly-off/route.js` with three
changes: it calls `getCalendarWeeklyOff` / `setCalendarWeeklyOff`, and the
`PUT` fans the recalculation over every assigned team:

```javascript
    const pattern = await setCalendarWeeklyOff(id, body, version, actor);

    // The day type of every date changes for every team on this calendar.
    for (const team of await listTeamsOnCalendar(id)) {
      await recalculateDays(
        null,
        { from: null, to: null },
        { teamId: String(team._id) },
      );
    }
```

Then:

```bash
git rm -r "app/api/teams/[id]/weekly-off"
```

- [ ] **Step 7: Re-point the holiday routes**

In `app/api/holidays/route.js`: the `GET` reads `calendarId` from the query
(400 with `'A calendar is required — holidays belong to a calendar, not a team.'`
when absent) and calls `listCalendarHolidays`. The `POST`, and both handlers in
`[id]/route.js` and `[id]/soft-delete/route.js`, replace the single
`recalculateDays(…, { teamId: created.teamId })` with a fan-out:

```javascript
    for (const team of await listTeamsOnCalendar(created.calendarId)) {
      await recalculateDays(
        null,
        { from: created.date, to: created.date },
        { teamId: String(team._id) },
      );
    }
```

Update each doc comment: a calendar is shared, so `BR-15`'s mid-year correction
now fans out across every team assigned — the widest fan-out in the system,
wider than it was.

- [ ] **Step 8: Add the route rules**

In `authz/routes.js`, beside the other config rules, above the dynamic
`/api/(shifts|holidays)` rule:

```javascript
  // `S-26`. The path gates on config.read; every mutation asserts config.write
  // in the handler, the same split the team routes use. The static segments
  // sit above the dynamic pattern that would otherwise swallow them.
  {
    pattern: /^\/api\/holiday-calendars\/[^/]+\/(soft-delete|teams|weekly-off)$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/holiday-calendars(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
```

And the screen rule, above `/^\/settings$/`:

```javascript
  {
    pattern: /^\/settings\/holiday-calendars$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
```

Remove `weekly-off` from the `/^\/api\/teams\/[^/]+\/(soft-delete|policy|weekly-off)$/`
rule, leaving `(soft-delete|policy)`. Unlike a retired *page*, this is a write
endpoint with no screen behind it and no link to it, so there is nothing for a
stale bookmark to reach and no redirect to add.

- [ ] **Step 9: Amend `__tests__/api.teams.test.js`**

Drop its `weeklyOffRoute` import and the weekly-off cases — they move to
`api.holidayCalendars.test.js`. Its holiday cases now post a `calendarId`.
Add one case asserting the retired path is unmapped:

```javascript
  it('leaves the team weekly-off path unmapped', () => {
    // The endpoint is gone, and an unmapped path answers 404 rather than
    // falling through as though it were public.
    expect(requiredPermissionFor('/api/teams/abc/weekly-off')).toBeUndefined();
  });
```

- [ ] **Step 10: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
npm run lint:fix && npm run lint
git add app/api authz/routes.js __tests__/
git commit -m "feat: the calendar owns its holidays, its weekly off and its teams"
```

---

### Task 9: The mutation hook

**Files:**
- Modify: `hooks/useOrgMutations.js`
- Test: `hooks/__tests__/useOrgMutations.test.js`

**Interfaces:**
- Consumes: Task 8's contract table.
- Produces, on the object `useOrgMutations()` returns:
  - `createCalendar(data)`, `renameCalendar(id, data)`,
    `softDeleteCalendar(id, data)`, `setCalendarTeams(id, data)`,
    `setWeeklyOff(calendarId, data)`
  - `createHoliday(data)` unchanged in name; `data` now carries `calendarId`.

- [ ] **Step 1: Write the failing test**

Assert the URL and method each function calls, against a mocked `fetch` — the
contract, not the implementation:

```javascript
  it('puts the team list to the calendar it belongs to', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(() =>
      result.current.setCalendarTeams('cal-1', { teamIds: ['team-1'] }),
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/holiday-calendars/cal-1/teams',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('puts the weekly off to the calendar, not the team', async () => {
    const { result } = renderHook(() => useOrgMutations());
    await act(() => result.current.setWeeklyOff('cal-1', { daysOfWeek: [0] }));

    expect(fetch).toHaveBeenCalledWith(
      '/api/holiday-calendars/cal-1/weekly-off',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
```

Follow the existing mocking style in `hooks/__tests__/`.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run hooks/__tests__/useOrgMutations.test.js`
Expected: FAIL — `setCalendarTeams is not a function`.

- [ ] **Step 3: Add the mutations**

In `hooks/useOrgMutations.js`, replace the `P-32` block:

```javascript
    // `S-26` · holiday calendars, shared across teams
    createCalendar: (data) => post('/api/holiday-calendars', data),
    renameCalendar: (id, data) => patch(`/api/holiday-calendars/${id}`, data),
    softDeleteCalendar: (id, data) =>
      post(`/api/holiday-calendars/${id}/soft-delete`, data),
    setCalendarTeams: (id, data) =>
      put(`/api/holiday-calendars/${id}/teams`, data),

    // P-32 · the weekly off pattern, now owned by the calendar
    setWeeklyOff: (calendarId, data) =>
      put(`/api/holiday-calendars/${calendarId}/weekly-off`, data),
```

Update the hook's doc comment: it is the write side of `S-16`, `S-17` and
`S-26`, which share one conflict surface.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run hooks/__tests__/useOrgMutations.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint:fix && npm run lint
git add hooks/
git commit -m "feat: the write side points at the calendar"
```

---

### Task 10: `S-26`, the Holiday Calendars screen

**Files:**
- Create: `app/(app)/settings/holiday-calendars/page.js`
- Create: `components/HolidayCalendars.jsx`
- Move: `components/team/HolidaysPanel.jsx` →
  `components/calendar/HolidaysPanel.jsx`
- Move: `components/team/WeeklyOffPanel.jsx` →
  `components/calendar/WeeklyOffPanel.jsx`
- Create: `components/calendar/CalendarTeamsPanel.jsx`,
  `components/calendar/CalendarFormDialog.jsx`
- Modify: `components/CompanySettings.jsx`
- Test: `components/__tests__/HolidayCalendars.test.jsx`

Both panels are **moved, not copied** — duplicating them would violate the
extract-at-the-second-use rule outright.

**Interfaces:**
- Consumes: Task 9's hook; `listHolidayCalendars`, `listTeamsOnCalendar`,
  `listCalendarHolidays`, `getCalendarWeeklyOff`, `listTeams` from
  `database.js`.
- Produces: `<HolidayCalendars calendars={…} teams={…} canWrite={…} />`, where
  each calendar is
  `{ _id, name, version, teams: [{ _id, name }], holidays: [...], weeklyOffPattern }`
  and `teams` is every live team as `{ _id, name, calendarId }`.

- [ ] **Step 1: Write the failing component test**

Create `components/__tests__/HolidayCalendars.test.jsx`. Assert state, role and
visibility — never a token:

```javascript
  it('names the teams a calendar serves', () => {
    render(
      <HolidayCalendars
        calendars={[
          {
            _id: 'cal-1',
            name: 'India',
            version: 1,
            teams: [{ _id: 'team-1', name: 'General' }],
            holidays: [],
            weeklyOffPattern: null,
          },
        ]}
        teams={[{ _id: 'team-1', name: 'General', calendarId: 'cal-1' }]}
        canWrite
      />,
    );

    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText(/General/)).toBeInTheDocument();
  });

  it('offers no write control to a viewer without config.write', () => {
    render(
      <HolidayCalendars calendars={[]} teams={[]} canWrite={false} />,
    );

    expect(
      screen.queryByRole('button', { name: /new calendar/i }),
    ).not.toBeInTheDocument();
  });

  it('says a team is on another calendar rather than showing it free', () => {
    // The picker has to be honest: assigning here MOVES the team, and a
    // control that looked like a free choice would hide that.
    render(
      <HolidayCalendars
        calendars={[
          { _id: 'cal-1', name: 'India', version: 1, teams: [], holidays: [], weeklyOffPattern: null },
        ]}
        teams={[
          { _id: 'team-1', name: 'General', calendarId: 'cal-2' },
        ]}
        canWrite
      />,
    );

    expect(screen.getByText(/on another calendar/i)).toBeInTheDocument();
  });

  it('states that a calendar with no weekly off classifies no date as one', () => {
    render(
      <HolidayCalendars
        calendars={[
          { _id: 'cal-1', name: 'India', version: 1, teams: [], holidays: [], weeklyOffPattern: null },
        ]}
        teams={[]}
        canWrite
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/no pattern/i);
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run components/__tests__/HolidayCalendars.test.jsx`
Expected: FAIL — cannot resolve `../HolidayCalendars.jsx`.

- [ ] **Step 3: Move the two panels**

```bash
git mv components/team/HolidaysPanel.jsx components/calendar/HolidaysPanel.jsx
git mv components/team/WeeklyOffPanel.jsx components/calendar/WeeklyOffPanel.jsx
```

In `HolidaysPanel.jsx`: rename the `teamId` prop to `calendarId`, pass
`{ ...data, calendarId }` to `createHoliday`, and rewrite the two copy lines
that say "this team's calendar" — the panel now edits a calendar several teams
share, and the description must say so, because an admin who thinks they are
editing one team's days will make a change they did not intend.

In `WeeklyOffPanel.jsx`: rename `teamId` to `calendarId`, call
`setWeeklyOff(calendarId, …)`, and change "The days this team does not work" to
"The days no team on this calendar works". Keep the untouched-checkbox
behaviour exactly — nothing is pre-ticked, per `FR-3.8`.

Both import paths shift by one directory: `'../../constants/index.js'` stays,
`'../EmptyState.jsx'` and `'../ReasonDialog.jsx'` stay.

- [ ] **Step 4: Write `CalendarTeamsPanel.jsx`**

A `<form onSubmit>` holding one checkbox per live team. A team already on
another calendar is still selectable, and its label says which — assigning
moves it, and the control must not look like a free choice. Submit calls
`setCalendarTeams(calendarId, { teamIds })`. `type='submit'` on the save
button, `type='button'` everywhere else.

- [ ] **Step 5: Write `CalendarFormDialog.jsx`**

One `TextField` for the name, following `TeamFormDialog.jsx` exactly: a real
form, Enter submits, Esc cancels through `Dialog onClose`.

- [ ] **Step 6: Write `HolidayCalendars.jsx`**

A `PageHeader`, a "New calendar" button behind `canWrite`, then one
`Accordion` per calendar summarising its name, its team count and its off-days,
expanding to a three-tab panel: Holidays, Weekly off, Teams. Rename and remove
sit in the summary row as `IconButton`s with `aria-label`s. The remove flows
through `ReasonDialog`; the 400 naming the assigned teams surfaces in the
dialog's own error slot, unchanged.

An `EmptyState` when no calendar exists at all, saying that every team is
unconfigured until one is created and assigned.

- [ ] **Step 7: Write the server page**

Create `app/(app)/settings/holiday-calendars/page.js`, following
`app/(app)/settings/page.js`: read the session and the data, serialise
`ObjectId` and `Date` to strings, hand everything down as props. No query
inline — add `listHolidayCalendarsWithDetail()` to `database.js` if the page
would otherwise need more than one call, and unit-test it there.

- [ ] **Step 8: Link it from `S-18`**

In `components/CompanySettings.jsx`, add a third `ConfigPanel` — or a card
beside the existing two — linking to `/settings/holiday-calendars` with `href`
(never `component={Link}`; this renders under a server component). State what
it holds: the holidays and the weekly off every team observes.

This step is the whole point of `README.md`'s warning that a routed, gated
screen nobody links to has not shipped.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run components/__tests__/HolidayCalendars.test.jsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
npm run lint:fix && npm run lint
git add app components
git commit -m "feat: S-26, where a calendar is built and handed to its teams"
```

---

### Task 11: `S-17` states its calendar and edits nothing

**Files:**
- Modify: `components/TeamConfiguration.jsx`
- Create: `components/team/AssignedCalendarPanel.jsx`
- Modify: `app/(app)/teams/[id]/page.js`
- Test: `components/__tests__/TeamConfiguration.test.jsx`

**Interfaces:**
- Consumes: Task 5's `getTeamConfiguration`, which returns `calendar`.
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Write the failing test**

```javascript
  it('names the calendar the team observes and offers no edit', () => {
    render(<TeamConfiguration configuration={withCalendar} users={[]} canWrite />);
    fireEvent.click(screen.getByRole('tab', { name: /holiday calendar/i }));

    expect(screen.getByRole('link', { name: /India/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new holiday/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save weekly off/i }),
    ).not.toBeInTheDocument();
  });

  it('offers no separate weekly off tab', () => {
    render(<TeamConfiguration configuration={withCalendar} users={[]} canWrite />);
    expect(
      screen.queryByRole('tab', { name: /weekly off/i }),
    ).not.toBeInTheDocument();
  });

  it('points a team with no calendar at S-26', () => {
    render(
      <TeamConfiguration
        configuration={{ ...withCalendar, calendar: null, holidays: [], weeklyOffPattern: null }}
        users={[]}
        canWrite
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /holiday calendar/i }));

    expect(
      screen.getByRole('link', { name: /holiday calendars/i }),
    ).toHaveAttribute('href', '/settings/holiday-calendars');
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run components/__tests__/TeamConfiguration.test.jsx`
Expected: FAIL — the Weekly off tab is still rendered.

- [ ] **Step 3: Write `AssignedCalendarPanel.jsx`**

Read-only. The calendar's name as a `<Link href='/settings/holiday-calendars'>`,
its holidays in the same table shape `HolidaysPanel` uses but with no action
column, its off-days written out in words, and an `Alert` saying this calendar
is shared and changing it affects every team assigned to it. When `calendar` is
null, an `EmptyState` linking to `S-26` and saying that until a calendar is
assigned no date is a holiday and none is a weekly off.

- [ ] **Step 4: Collapse the two tabs into one**

In `components/TeamConfiguration.jsx`:

```javascript
const TABS = [
  'Members',
  'Shifts',
  'Holiday calendar',
  'Leave policy',
  'Ladders',
  'Thresholds & windows',
];
```

Replace the `tab === 2` and `tab === 3` blocks with a single `tab === 2`
rendering `<AssignedCalendarPanel calendar={calendar} holidays={holidays}
weeklyOffPattern={weeklyOffPattern} />`, and shift the remaining three indices
down by one. Drop the `HolidaysPanel` and `WeeklyOffPanel` imports. Destructure
`calendar` from `configuration`.

- [ ] **Step 5: Serialise the calendar on the server page**

In `app/(app)/teams/[id]/page.js`, add to the `configuration` prop:

```javascript
        calendar: configuration.calendar
          ? plain(configuration.calendar, ['name', 'version'])
          : null,
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run components/__tests__/TeamConfiguration.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run lint:fix && npm run lint
git add app components
git commit -m "feat: a team states its calendar and edits none of it"
```

---

### Task 12: Verify, then merge

**Files:** none created; this is the gate.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: PASS, no skips.

- [ ] **Step 2: Lint, twice**

```bash
npm run lint:fix && npm run lint:fix && npm run lint
```

Expected: exit 0.

- [ ] **Step 3: Ask before building**

`npm run build` collides with a running `npm run dev` over `.next`. Ask
whether the dev server is running before starting it; if it is, ask them to
stop it first.

Run: `npm run build`
Expected: build succeeds. A `component={Link}` passed from a server component
fails here and nowhere else, so this step is not optional.

- [ ] **Step 4: Walk the screens**

With `npm run dev`, confirm by hand:

1. `/settings` links to Holiday calendars.
2. Creating a calendar, adding a holiday, setting the weekly off, assigning two
   teams.
3. Removing that calendar is refused, and the message names both teams.
4. Unassigning both, then removing it, succeeds.
5. `/teams/<id>` shows the calendar read-only, with no Weekly off tab.
6. A team with no calendar shows the gap in the S-17 alert and on
   `/exceptions`.

- [ ] **Step 5: Squash-merge and push**

```bash
git checkout main
git merge --squash holiday-calendars
git commit
git push origin main
```

The commit message: `feat: holiday calendars are shared, and own the weekly off`,
with a body naming `D-28` through `D-34`.

Feature branches stay local; only `main` is pushed.

---

## Self-Review

**Spec coverage.** `D-28` → Tasks 3 and 5. `D-29` → Tasks 3 and 7. `D-30` →
Task 4. `D-31` → Tasks 4 and 8. `D-32` → Task 4 (a plain `$set`, no effective
dating anywhere). `D-33` → Task 2. `D-34` → Task 6. The spec's §4 surfaces →
Tasks 8, 10, 11. Its §5 testing list → the test steps in Tasks 2, 3, 4, 6, 7,
8, 10, 11.

**Type consistency.** `listCalendarHolidays` / `getCalendarWeeklyOff` /
`setCalendarWeeklyOff` / `listHolidaysForTeam` / `getWeeklyOffPatternForTeam` /
`setCalendarTeams` / `listTeamsOnCalendar` / `getHolidayCalendarById` are each
introduced once and used under that exact name afterwards. `setCalendarTeams`
returns `{ joined, left }` everywhere it appears. The hook's `setWeeklyOff`
keeps its name and changes only its first argument, from `teamId` to
`calendarId` — the one place a name survives a meaning change, called out in
Task 9 so it is not missed.

**Known ordering.** Task 3 leaves the tree failing to import in three files;
Task 5 fixes them. That is deliberate and stated in Task 3's final step. Two
tests written in Task 3 fail until Task 4 lands, also stated. Do not "fix"
either by softening a test.

# Holiday calendars — design

A holiday calendar stops being something a team owns and becomes something a
team is **assigned to**. Two or three calendars serve fifteen to twenty teams.
The weekly off pattern moves with the holidays, because the two answer the same
question — which dates are not working days — and splitting them across two
owners would let a team observe one calendar's holidays on another calendar's
working week.

`spec.md` `FR-3.7` and `FR-3.8` are amended by this change rather than
contradicted by it; the amendment is part of the work. Where anything here
disagrees with the amended `spec.md`, `spec.md` wins and this document is
wrong.

---

## 1 · What changes

| Before | After |
| ------ | ----- |
| `holidays.teamId` | `holidays.calendarId` |
| `weeklyOffPatterns.teamId` | `weeklyOffPatterns.calendarId` |
| — | `holidayCalendars` collection |
| — | `teams.calendarId`, nullable |
| `S-17` tabs *Holiday calendar* + *Weekly off*, both editable | one read-only *Holiday calendar* tab naming the assigned calendar |
| — | `S-26` at `/settings/holiday-calendars` |
| `PUT /api/teams/[id]/weekly-off` | `PUT /api/holiday-calendars/[id]/weekly-off` |

Nothing about how a date is classified changes. `engine/classify.js`,
`engine/calendarDays.js`, `engine/recalculate.js` and `engine/reports.js`
are untouched.

---

## 2 · Decisions taken

Numbered on from `2026-08-17-phase-6-design.md`'s `D-27`. Every one below is
Ahmar's, taken 2026-08-27.

### D-28 · The engine keeps its per-team view; only the loader resolves a calendar

`countCalendarDays`, `resolveDayType` and `recalculateOneDay` consume
`holidaysByTeam` and `weeklyOffByTeam` maps, keyed on the team the user held
**on each date**. That keying is not incidental — it is what makes a mid-period
team move come out right (`FR-3.9`, MVP criterion 19), and a calendar-keyed
engine would have to re-derive the same thing one layer up.

So the maps stay. `database.js` gains `listHolidaysForTeam(teamId)` and
`getWeeklyOffPatternForTeam(teamId)`, which resolve the team's `calendarId` and
delegate to `listCalendarHolidays(calendarId)` and
`getCalendarWeeklyOff(calendarId)`. Three call sites change —
`loadRecalculationInputs`, `calendarInputsFor`, `TeamCalendarCache` — and no
engine function does.

The alternative, passing `holidaysByCalendar` plus a team-to-calendar map into
every pure function, was rejected: it widens four signatures and moves a
resolution step into code that is pure precisely so it can be tested without a
database.

### D-29 · A team with no calendar is an outstanding value, never a default

There is no default calendar and no fallback. A team with `calendarId: null`
reads as no holidays and no weekly off, and `missingConfiguration` reports it —
so it sits on `S-05` and on `S-17`'s gap list until somebody decides it.

This is `DC-6` applied unchanged. Defaulting to Saturday and Sunday is the
exact assumption `FR-3.8` was written to forbid, and a "default calendar" flag
would smuggle it back in wearing different clothes.

The gap splits in two, because the failure has two distinct causes and two
distinct fixes:

- no calendar assigned → gap on the team, fixed on `S-26`
- calendar assigned but holding no weekly off pattern → gap on
  `Calendar <name>`, fixed on `S-26`

An empty `daysOfWeek` array remains a real answer — a calendar whose teams work
every day — exactly as it was per-team.

### D-30 · Soft delete is refused while any team is assigned

`softDeleteHolidayCalendar` throws a `ValidationError` naming the assigned
teams. The same reasoning as refusing to remove the last authorised domain: the
click is one action, the consequence is every team on that calendar losing its
working week at once, and nothing in the UI would make that visible before it
happened.

Reassign first, then delete. The record is soft deleted like every other, so a
day record computed while the calendar was live can still explain itself.

### D-31 · Assignment is written from the calendar, in one place

`PUT /api/holiday-calendars/[id]/teams` takes the full list of team ids the
calendar serves and reconciles it: teams named but not currently assigned join,
teams currently assigned but not named leave. A team can hold at most one
calendar, so joining a team already on another calendar moves it — the write is
a `$set` of `teams.calendarId`, and single-valued storage makes the constraint
unbreakable rather than merely enforced.

`S-17` gets no picker. Two write paths to one field is two places to get the
audit record and the recalculation fan-out right, and they would drift.

Recalculation covers **both sides**: every team joining and every team leaving,
each over its whole range, because the day type of every date changes for both.

### D-32 · The assignment is current-state, not effective-dated

`teams.calendarId` is replaced in place. There is no
`effectiveFrom`/`effectiveTo` the way `teamAssignments` carries for users.

A user moves between teams often enough that "which team on this date" is a
real question with a real answer. A team moves between calendars approximately
never, and when it does the intent is a correction — the calendar it should
have been on all along — not a change taking effect from a date. Effective
dating it would add a second time-varying dimension to every classification and
every report count in exchange for a history nobody asked for. The audit record
holds the change; a recalculation applies it everywhere.

`BR-15` still holds: a mid-year calendar edit is legitimate, audited, and
recalculates the dates it touches. The fan-out is simply wider now — every team
assigned rather than the one that owned it.

### D-33 · A calendar carries a name and nothing else

No description, no timezone, no colour. The timezone the engine reads lives on
the shift (`FR-3.10`, `DC-5`), and a second one on the calendar is a source of
drift with no reader. The name is unique among live calendars, because two
calendars called "India" are indistinguishable in the picker that assigns them.

### D-34 · Existing per-team data migrates to one calendar per team

`migrateTeamCalendars()` in `database.js`, run from `scripts/seed.js` **before**
`ensureIndexes` — the same position and the same reason as
`migrateLegacyTeamKeys`: the unique index on `(companyId, calendarId)` cannot
build while several rows share a null one.

For each team holding at least one holiday or a weekly off pattern it creates
`<Team name> calendar`, stamps `calendarId` on that team's holidays and
pattern, and sets the team's `calendarId`. Nothing is merged automatically —
four seeded teams observe deliberately different days (`MVP` criterion), and a
script cannot know which of those differences were intentional. Admins merge
down to two or three on `S-26`.

Idempotent: after one run no holiday or pattern carries `teamId`, so it matches
nothing.

---

## 3 · Data model

```
holidayCalendars
  _id, name, companyId, version,
  createdAt/By, updatedAt/By, deletedAt/By, deletionReason

holidays
  _id, calendarId, date, name, type, companyId, version, …   (was teamId)

weeklyOffPatterns
  _id, calendarId, daysOfWeek[], companyId, version, …        (was teamId)

teams
  … + calendarId: string | null
```

Indexes:

| Collection | Key | Note |
| ---------- | --- | ---- |
| `holidayCalendars` | `(companyId, name)` unique, partial on `deletedAt: null` | `D-33` |
| `holidays` | `(companyId, calendarId, date)` | replaces the `teamId` form |
| `weeklyOffPatterns` | `(companyId, calendarId)` unique | replaces the `teamId` form |
| `teams` | `(companyId, calendarId)` | the assignment reads it per calendar |

---

## 4 · Surfaces

### `S-26` · `/settings/holiday-calendars`

Reached from `S-18`. Gated `config.read`; every mutation asserts `config.write`
through `guard.js`, the same split the team routes use.

One page. A list of calendars, each stating its team count and its off-days at
a glance; opening one reveals three panels:

- **Holidays** — `components/team/HolidaysPanel.jsx` moved to
  `components/calendar/` and re-pointed at `calendarId`. Not duplicated.
- **Weekly off** — `components/team/WeeklyOffPanel.jsx`, likewise.
- **Teams** — every live team, each either on this calendar, on another
  (named), or on none. Saving reconciles per `D-31`.

Create and rename through a dialog. Delete per `D-30`.

### `S-17` · the team's tab

*Holiday calendar* and *Weekly off* collapse into one read-only tab: the
calendar's name linking to `S-26`, its holidays, its off-days, and a note that
changing any of it affects every team assigned. Seven tabs become six. A team
with no calendar shows an empty state pointing at `S-26`.

### API

| Route | Methods | Recalculates |
| ----- | ------- | ------------ |
| `/api/holiday-calendars` | GET, POST | — |
| `/api/holiday-calendars/[id]` | PATCH | — (a rename changes no date) |
| `/api/holiday-calendars/[id]/soft-delete` | POST | — (refused while assigned) |
| `/api/holiday-calendars/[id]/teams` | PUT | every team joining **and** leaving, whole range |
| `/api/holiday-calendars/[id]/weekly-off` | PUT | every assigned team, whole range |
| `/api/holidays` | GET `?calendarId=`, POST | every assigned team, the one date |
| `/api/holidays/[id]` | PATCH | every assigned team, both dates |
| `/api/holidays/[id]/soft-delete` | POST | every assigned team, the one date |

`/api/teams/[id]/weekly-off` is deleted, and its rule leaves `authz/routes.js`.
It is a write endpoint with no screen behind it and no link to it, so unlike a
retired *page* there is nothing for a stale bookmark to reach.

---

## 5 · Testing

TDD throughout, contract tests before route handlers (`CLAUDE.md`).

`database.js` against the real in-memory Mongo:

- calendar CRUD, duplicate live name refused, rename releases the old name
- `softDeleteHolidayCalendar` refused while assigned, permitted once not, and
  the message names the teams
- `setCalendarTeams` reconciles: joins, leaves, moves a team off another
  calendar, and is a no-op given the list it already holds
- `listHolidaysForTeam` / `getWeeklyOffPatternForTeam` return the calendar's
  records, and empty/null for a team with no calendar
- `migrateTeamCalendars` moves the records, sets `teams.calendarId`, creates
  nothing for a team with neither, and is idempotent over two runs
- every mutation writes an audit record

Contract tests both sides for each new route — request shape, status codes,
payload schema, error format — and the client hook consuming it.

`missingConfiguration`: no calendar → team gap; calendar without a pattern →
calendar gap; calendar with `daysOfWeek: []` → no gap.

Component tests assert state, role and visibility: the read-only `S-17` tab
offers no edit control, and the delete refusal surfaces the named teams.

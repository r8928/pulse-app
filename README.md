# Pulse

Attendance, leave, PTO and CTO. Replaces the Excel workbook.

What it must do: [`spec.md`](spec.md) · Where it surfaces: [`list-of-screens.md`](list-of-screens.md) · **How to build it: [`ARCHITECTURE.md`](ARCHITECTURE.md)** · How it looks: [`DESIGN.md`](DESIGN.md) · Coding rules: [`CLAUDE.md`](CLAUDE.md)

**This README is the spec-first feature list. Update it before implementing a feature.**

---

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in every value
npm run seed
npm run dev
```

`npm run seed` refuses to run without `SEED_ADMIN_EMAIL`. Its domain becomes the
authorised Workspace domain, so guessing one would lock everybody out.

Google OAuth redirect URI must be `http://localhost:3000/api/auth/callback/google`.

| Script | Does |
| ------ | ---- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | Biome. **Must exit 0 before any commit.** |
| `npm run lint:fix` | Biome with `--write` |
| `npm test` | Vitest, once |
| `npm run seed` | Loads §3.10 configuration and the administrator accounts. Idempotent. |
| `npm run purge-users -- <codes>` | Removes seeded users outright. Destructive; names each code. |

---

## What is built

| Area | State |
| ---- | ----- |
| Google sign-in, five distinct rejection reasons | Done |
| RBAC + ABAC + FGAC, grants stored as data | Done |
| `proxy.js` endpoint check, `guard.js` record check | Done |
| App shell, every screen routed and gated | Done |
| People: roster, detail, create, soft delete, restore | Done |
| Create a user with their team and shift, per `FR-2.1` | Done — team optional, both required once they are attendance-tracked (`FR-3.4`) |
| People is admin-only, and a colleague reaches only their own record | Done — `proxy.js` redirects `/users` to their own profile and 404s anybody else's |
| Optional phone number: form, profile, roster column, import sheet | Done — never required, stored exactly as written |
| Company config: employment types, authorised domains (`S-18`) | Done |
| Access control matrix, effective next request (`S-19`) | Done |
| Teams, with the manager and member count (`S-16`) | Done |
| Team configuration: shifts, calendar, weekly off, policy, ladders (`S-17`) | Done |
| Shift times read as 12-hour clock times | Done — `9:00 AM`, not `09:00`; the edit dialog keeps the browser's own time input |
| User lifecycle: role, team, shift, tracked, login, tenures (`S-07`) | Done |
| Roster import from the Biometric ID sheet (`S-08`) | Done |
| Sheet format guide on arriving at `S-08`, plus a blank template to download | Done |
| `S-08` reads the `FR-2.6` fields from the sheet where it carries them | Done |
| `S-08` step 2 is a table on tablet and up, one card per person below it | Done |
| Audit records on every mutation | Done |
| Audit log: paged, filterable, read only (`S-22`) | Done |
| Navigation in three bands: drawer, icon rail, full drawer | Done |
| A skeleton while a screen loads, so no tab shows the last one's buttons | Done — one `loading.js` over the whole authenticated shell |
| Optimistic concurrency, 409 on stale writes | Done |
| Seed script | Done |
| Attendance capture: day detail, punch and override popups (`S-12`) | Done |
| **Attendance & Leaves in two pages** | Done — summary and balance history; the daily grid is retired |
| Summary: attendance + leave balances + report columns, one row per colleague | Done — rows narrowed by the viewer's scope |
| Hours checked in against hours expected, approved leave netted off and shown | Done |
| WFH used against the team's monthly quota | Done — the ratio only over a month, since `BR-16` caps it per month |
| Weekly / monthly / custom period filter, week starting Monday | Done — the period is in the URL, so a view is a link |
| Summary opens on "Just me" for a colleague and "Everyone" for an admin | Done — a default, not a limit; either can switch |
| "Include colleagues who have left", admin-only, off by default | Done — `FR-2.4` keeps their figures readable when it is on |
| Detailed report, read on screen without downloading | Done — a popup over the content area, sidebar and top bar still usable |
| Day-by-day detail: every date in a period, per colleague | Done — continuous, so a gap is visible |
| Balance history and the ledger trace (`S-14`) | Done — every figure replayed, never stored |
| Balance history one click from the home page | Done — a button on the snapshot, and every balance figure is itself a link |
| Home is self-service, not a menu | Done — the module tiles are gone; the left rail is the only way in |
| Day classification (`FR-5.x`) | Done — engine, ledger posting and both screens |
| Leave recorded per date, deducted from the ledger (`P-26`) | Done |
| Leave engine (`FR-6.x`): entitlements, proration, carry forward | Done |
| PTO and CTO (`FR-7.x`, `S-15`) | Done — proposed by the engine, decided only by a human |
| Exceptions dashboard, all twelve queues (`FR-8.6`, `S-05`) | Done — derived live, so fixing the record clears the queue |
| Employment-period reduction approval (`FR-2.11`, `P-05`) | Done — the soft delete never waits for it; only the stranded records do |
| Annual summary and export (`FR-8.3`–`FR-8.5`) | Done — working days come from the calendar held on each date; both now live under Attendance |
| Attendance Excel import (`S-11`) | Done — confirm the date format, preview, then commit atomically |
| Sheet format guide on arriving at `S-11`, plus a blank punch template to download | Done |
| Light and dark colour schemes, chosen from the top bar | Done — CitrusBits palette, both schemes AA-verified |
| Tablet-first sizing, 44px touch targets, column priority on tables | Done |

Every collection exists already, so none of the above needs a migration.

---

## Things that will bite you

**`proxy.js` is the only auth validator.** Not a convention — a rule. Adding a
guard or an unauthenticated redirect to a page or route creates a second source
of truth that will drift. In Next 16 this file runs on the Node runtime and
that cannot be changed, which is why it can query Mongo.

**Never cache permission grants.** They are read per request on purpose. Caching
them breaks `FR-1.2`, and MVP criteria 4 and 7 with it.

**The JWT carries identity only.** Role and grants are re-read every request, so
a role change or an `S-19` edit lands on the next request rather than the next
sign-in.

**Server components cannot pass functions to client components.** `component={Link}`
on an MUI component inside a server component fails the build. Use `href`.

**A record outside the viewer's scope answers 404, never 403.** 403 would confirm
it exists.

**Soft delete only.** There is no hard-delete function in `database.js` and none
may be added. Ledger entries are cancelled by a reversing entry, never edited.

**Every query lives in `database.js`.** Including single-caller ones. It is
tested against a real in-memory MongoDB (`test/mongo.js`), not a mocked driver —
a mock cannot fail a wrong filter or a missing `deletedAt: null`.

**Removing the last authorised domain is refused.** `FR-1.5` admits a sign-in
only from an authorised domain, so an empty list is a lockout with no signed-in
surface left to undo it from. Add the replacement first.

**A withheld permission is a row with a null scope, not a missing row.** Nothing
is destroyed, the row keeps its version for the next edit, and the change has a
real before and after to audit.

**Policy is data.** Ladders, thresholds, entitlements and windows live in
`teamPolicy`, not in `constants/`. If you are typing a number from §3.10 into a
`.js` file, stop.

**Teams and shifts are referenced by `_id`, never by `key`.** `key` is the
seed's idempotency key and is null for anything created in the app.

**Two per-team windows are unset on every team, on purpose.** `spec.md` gives
no value for the midnight-crossing or duplicate-punch windows, so `S-17` asks
rather than guessing. Three of the four seeded teams likewise have no manager.
That is `DC-6` working, not a broken seed.

**The roster import guesses nothing.** The sheet carries a code and a name;
every other field is prompted for and the commit is blocked until each is
answered. It imports people, not attendance.

**`recalculateDays` returns zero until Phase 5.** Its callers are real; the
body is not. `database.js` must never import it — the engine imports
`database.js`.

**Two theme callbacks, two signatures.** `MuiCssBaseline.styleOverrides` is
handed the theme itself; a component `variants` entry is handed `{ theme }`.
Swapping them yields `undefined.vars`, passes every unit test, and fails only at
prerender.

**A new colour token goes in both schemes or neither.** `lightColors` and
`darkColors` in `app/theme/colors.js` are asserted to hold identical keys. For
anything scheme-dependent use `theme.applyStyles('dark', …)` or `theme.vars` —
never spell out the `.dark` selector, or the scheme has two places it is
configured.

**A routed, gated screen must be linked from somewhere.** `S-08` and `S-11`
were both built, both permission-gated and both reachable only by typing the
URL, so the go-live roster import was invisible to the people who needed it.
Adding a route is not shipping a screen.

**A retired route must still resolve.** `/reports`, `/reports/annual` and
`/attendance/entry` redirect from `next.config.mjs` and their rules in
`authz/routes.js` are `null` on purpose. A link somebody already sent
answering 404 costs as much as the invisible screen above; gating a doorway
that only forwards would answer 403 to someone allowed to read the
destination.

**A list is scoped before the query, not after.** `guard.js` answers "does this
scope reach this record" once a record has been read. A screen showing a roster
has to ask first, or it fetches rows it must then throw away — and one
forgotten filter shows a colleague the whole company. That is
`authz/rosterScope.js`, and it is why the report columns can sit on a screen
`EMPLOYEE` reaches.

**Nothing in the UI mints a day record any more.** The daily grid did, by
opening (`D-15`), and it is gone. A date with no punch and no leave carries no
record, so the day detail has nothing to correct there — the punch import is
what brings such a date into existence. `/api/attendance?materialise=true`
still performs the touch for a caller that asks.

**The popup's rows come from the viewer's scope, never from its query.** It is
a client component, so `/api/attendance/day-by-day` treats `userIds` as a
preference underneath the scope ceiling and never as a way to raise it.

**Dates go through `date-fns`.** No `new Date()` for parsing or arithmetic.

**Run `npm run lint:fix` twice** after large edits — nested formatting sometimes
needs a second pass before `npm run lint` exits 0.

---

## Layout

```
proxy.js          the single auth/session/authorization validator
auth.js           Auth.js v5, Google, JWT, no adapter
session.js        the one place a server component reads the user
database.js       every MongoDB query
constants/        every domain enum
authz/            check.js · routes.js · guard.js · signin.js
utils/            employment.js · apiResponse.js
test/             mongo.js — the in-memory database harness
components/       shared UI; navigation.js is data-only
hooks/            client-side business logic
app/theme/        colors.js · theme.js · fonts.js
app/(app)/        the authenticated shell and its screens
scripts/seed.js   §3.10 configuration and the administrator accounts
```

---

## Known risk

`next-auth` is on `5.0.0-beta.32`. v5 is the App-Router-first line and lists
`next ^16` as a supported peer, but it is pre-release. All of it is confined to
`auth.js` and `session.js`, so replacing it is a two-file change.

`npm audit` reports two moderate advisories from `exceljs`, both the same
`uuid` one: *missing buffer bounds check in v3/v5/v6 when `buf` is provided*.
It is not reachable — `exceljs` calls `uuidv4()` with no buffer. Recorded here
rather than left to look like a clean audit.

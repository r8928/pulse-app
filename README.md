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
| `npm run seed` | Loads §3.10 configuration and a demo roster. Idempotent. |

---

## What is built

| Area | State |
| ---- | ----- |
| Google sign-in, five distinct rejection reasons | Done |
| RBAC + ABAC + FGAC, grants stored as data | Done |
| `proxy.js` endpoint check, `guard.js` record check | Done |
| App shell, all 22 screens routed and gated | Done |
| People: roster, detail, create, soft delete, restore | Done |
| Company config: employment types, authorised domains (`S-18`) | Done |
| Access control matrix, effective next request (`S-19`) | Done |
| Teams, with the manager and member count (`S-16`) | Done |
| Team configuration: shifts, calendar, weekly off, policy, ladders (`S-17`) | Done |
| Audit records on every mutation | Done |
| Optimistic concurrency, 409 on stale writes | Done |
| Seed script | Done |
| Attendance capture (`FR-4.x`) | Stub screen only |
| Day classification (`FR-5.x`) | Not started |
| Leave engine (`FR-6.x`), PTO and CTO (`FR-7.x`) | Not started |
| Reporting (`FR-8.3`–`FR-8.5`), exceptions queue (`FR-8.6`) | Stub screens only |
| Both Excel imports | Stub screens only |

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

**`recalculateDays` returns zero until Phase 5.** Its callers are real; the
body is not. `database.js` must never import it — the engine imports
`database.js`.

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
scripts/seed.js   §3.10 configuration and demo roster
```

---

## Known risk

`next-auth` is on `5.0.0-beta.32`. v5 is the App-Router-first line and lists
`next ^16` as a supported peer, but it is pre-release. All of it is confined to
`auth.js` and `session.js`, so replacing it is a two-file change.

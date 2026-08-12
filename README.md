# Pulse

Attendance, leave, PTO and CTO. Replaces the Excel workbook.

Spec: [`spec.md`](spec.md) · Screens: [`list-of-screens.md`](list-of-screens.md) · Design: [`DESIGN.md`](DESIGN.md) · Rules: [`CLAUDE.md`](CLAUDE.md)

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

**Every query lives in `database.js`.** Including single-caller ones.

**Policy is data.** Ladders, thresholds, entitlements and windows live in
`teamPolicy`, not in `constants/`. If you are typing a number from §3.10 into a
`.js` file, stop.

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

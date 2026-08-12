# Pulse Boilerplate — Design

**Date:** 2026-08-12
**Status:** Approved
**Sources:** `spec.md`, `list-of-screens.md`, `CLAUDE.md`, supervisor tech-stack briefing

---

## 1. Goal

Stand up the Pulse project from an empty repository to a running, tested, deployable
skeleton that establishes every pattern the remaining 21 screens will copy.

This is **not** Phase 1 of the product. It is the substrate Phase 1 is built on, plus one
vertical slice proving that substrate works end to end.

### In scope

1. Toolchain and project configuration.
2. The four design-token surfaces.
3. Domain constants.
4. The data layer, with a collection for every entity the spec names.
5. The authorization engine (`FR-1.2`) — endpoint check and record check.
6. Google sign-in (`FR-1.1`, `FR-1.5`).
7. The app shell and all 22 routes, 21 of them as structural stubs.
8. One vertical slice: part of module M-3 People.
9. A seed script loading the §3.10 configuration plus demo users.
10. `README.md` and `DESIGN.md`.

### Explicitly out of scope

The calculation engine (`FR-5.x`, `FR-6.x`, `FR-7.x`), attendance capture (`FR-4.x`),
reporting (`FR-8.3`–`FR-8.5`), both Excel import flows, and Vercel deployment. Their
routes exist as stubs and their collections exist in the schema, so none of them
requires a migration when it ships.

---

## 2. Decisions and their reasons

| # | Decision | Reason |
| - | -------- | ------ |
| D-1 | Plain JavaScript, not TypeScript | `vitest.config.mjs` matches only `*.test.js` / `*.test.jsx`; `CLAUDE.md` names `page.js`, `database.js`, `theme.js`, `colors.js`, `fonts.js` throughout. The repo already decided this. |
| D-2 | Auth.js v5 (`next-auth@5.0.0-beta.32`), Google provider, `strategy: 'jwt'`, **no database adapter** | An adapter would create `accounts` and `sessions` collections — the separate account entity `FR-2.5` forbids. JWT sessions keep the user as a single entity. |
| D-3 | Native `mongodb` driver + Zod, no ODM | Reporting (`FR-8.3`) and ledger replay (`FR-6.8`, `BR-14`) are aggregation-heavy. `DC-1` requires configuration documents whose shape varies per team at runtime, which a rigid ODM schema fights. |
| D-4 | All authorization work happens in `proxy.js` on the Node.js runtime | Verified against Next.js 16 docs: `proxy.js` defaults to `nodejs` and the runtime **cannot** be configured. The MongoDB driver therefore works there, which is what makes `FR-1.2`'s "effective on the next request, no redeploy" achievable. |
| D-5 | Theme files live in `app/theme/` | Chosen over the two other locations `CLAUDE.md` names. `CLAUDE.md` is corrected in the same commit so the rule no longer contradicts itself. |
| D-6 | No `@mui/x-data-grid` | MUI `Table` plus server-side `TablePagination` satisfies `NFR-3` and `DC-10` without the dependency. |
| D-7 | No xlsx parser yet | Both import screens (`S-08`, `S-11`) are stubs in this phase. YAGNI. |
| D-8 | `companyId` on every document from day one | `DC-12` requires multi-tenancy support in the schema with no later migration. |
| D-9 | `version` integer on every mutable document | `NFR-14` and `DC-9` require stale writes to be rejected rather than silently overwritten. |
| D-10 | The vertical slice is M-3 People | It is the Phase 1 module, and it is the only one that exercises soft delete, restore, tenures, the `FR-2.11` approval queue, and audit writes all at once. |

---

## 3. Architecture

### 3.1 File layout

```
pulse-app/
├── .editorconfig                 renamed from `editorconfig` (missing dot = ignored by editors)
├── .env.example
├── .gitignore
├── biome.json                    exists
├── next.config.mjs
├── package.json
├── vitest.config.mjs             exists
├── vitest.setup.js               exists
├── proxy.js                      the single auth/session/authorization validator
├── auth.js                       Auth.js v5 configuration
├── database.js                   every MongoDB query in the application
├── DESIGN.md
├── README.md
├── constants/
│   └── index.js
├── authz/
│   ├── permissions.js            the permission catalog, shaped as data
│   ├── check.js                  pure scope-resolution functions
│   ├── routes.js                 route pattern -> required permission
│   └── guard.js                  record-level check for API routes
├── scripts/
│   └── seed.js
├── utils/
├── hooks/
├── components/
└── app/
    ├── layout.js
    ├── theme/
    │   ├── colors.js
    │   ├── theme.js
    │   └── fonts.js
    ├── __tests__/
    │   └── theme.test.js
    ├── signin/page.js
    ├── 403/page.js
    ├── not-found.js               serves S-03; App Router convention, also reachable at /404
    └── (app)/                    authenticated shell
        ├── layout.js
        ├── page.js               S-04 Home
        ├── exceptions/           S-05
        ├── users/                S-06, S-07, S-08
        ├── attendance/           S-09 .. S-12
        ├── leave/                S-13, S-14
        ├── pto/                  S-15
        ├── teams/                S-16, S-17
        ├── settings/             S-18, S-19
        ├── reports/              S-20, S-21
        └── audit/                S-22
```

### 3.2 Request flow

```
Browser request
      |
      v
proxy.js  (Node.js runtime)
      |-- no session?                     -> redirect /signin
      |-- load permission grants (Mongo)
      |-- route -> required permission (authz/routes.js)
      |-- resolveScope(grants, role, perm)
      |     |-- null                      -> redirect /403
      |     `-- SELF | TEAM | ALL         -> continue, scope attached to headers
      v
Server Component  (reads session, passes session.user down as a prop)
      v
Client leaf       (renders from the session.user prop; never reads session itself)

API route
      |-- proxy.js has already done the endpoint check
      |-- authz/guard.js does the RECORD check (the ABAC half)
      |     `-- record out of scope       -> 404, so existence is not leaked
      `-- mutation -> version check -> write -> audit record
```

Both checks are mandatory. `FR-1.2` states plainly that neither alone is sufficient.

---

## 4. Components

### 4.1 Design tokens — four surfaces, one commit

`app/theme/colors.js` holds hexes and nothing else. `app/theme/theme.js` holds radii,
shadows, spacing, density, typography variants, and component variants.
`app/theme/fonts.js` self-hosts fonts via `next/font/google`. `DESIGN.md` documents them
in frontmatter and prose. `.impeccable/design.json` mirrors them.

Direction is **dense data-first admin**: near-neutral greys, one restrained accent hue,
compact density, tabular numerals on every figure, deliberately strong focus rings.
Status is conveyed by icon plus label, never colour alone (`NFR-12`, `DC-11`).

Typography variants seeded: `pageTitle`, `sectionTitle`, `metricLabel`, `metricValue`,
`mono`, `bodyStrong`. Status and severity presets are **component variants** selected by
the `variant` prop — never `sx` maps, per `CLAUDE.md`.

Token assertions live only in `app/__tests__/theme.test.js`.

### 4.2 `constants/index.js`

`ROLES`, `SCOPES`, `PERMISSIONS`, `DAY_TYPE`, `DAY_STATUS`, `EMPLOYMENT_TYPE`,
`HOLIDAY_TYPE`, `PUNCH_TYPE`, `PUNCH_SOURCE`, `LEDGER_ENTRY_TYPE`, `RESTORE_CASE`,
`SIGNIN_REJECTION`, `APPROVAL_STATUS`.

`SIGNIN_REJECTION` carries the five distinct reasons `S-01` requires: unauthorised
domain, no user with that work email, user soft deleted, login disabled, date outside
the employment period. One generic failure message is not acceptable.

### 4.3 `database.js`

An HMR-safe connection singleton, Zod validators on every write, and `ensureIndexes()`
invoked by the seed script.

Collections — all created now so nothing needs migrating later:

| Group | Collections |
| ----- | ----------- |
| Identity | `users`, `tenures`, `permissionGrants`, `authorisedDomains` |
| Organisation | `teams`, `shifts`, `shiftAssignments`, `teamAssignments`, `holidays`, `weeklyOffPatterns`, `teamPolicy`, `employmentTypes` |
| Attendance | `punches`, `dayRecords` |
| Balances | `ledgerEntries`, `leaveRecords`, `ptoAwards`, `ctoApplications` |
| Workflow | `approvals`, `auditRecords` |

Every document carries `companyId` (`DC-12`), `deletedAt` (`DC-3`), `version` (`NFR-14`),
and created/updated actor and timestamp.

Three record classes behave differently, per `NFR-9`:

- **Working records** — edited in place, soft deleted.
- **Ledger entries** — never edited, never deleted, never soft deleted; cancelled only by
  appending a reversing entry.
- **Audit records** — append only.

No function in `database.js` performs a hard delete of a user, attendance record, or
leave record. There is no code path to write one.

### 4.4 Authorization engine

`authz/permissions.js` declares the catalog. It is seeded into `permissionGrants` and
read from Mongo thereafter, never from code — this is what makes `S-19` real.

`authz/check.js` exports two pure functions, both fully unit tested:

- `resolveScope(grants, role, permission)` → `'SELF' | 'TEAM' | 'ALL' | null`
- `recordInScope(scope, actor, record)` → boolean

`authz/routes.js` maps route patterns to required permissions.

`authz/guard.js` is what API routes call to perform the record check.

**The `OFFICE_ADMIN` invariant** (`FR-1.3`): every grant write is validated so that
`OFFICE_ADMIN` holds every defined permission at `ALL`. Any edit reducing it is rejected
with that stated as the reason. The invariant lives in the write path, so `S-19` cannot
violate it regardless of what the UI sends.

### 4.5 `auth.js`

Auth.js v5, Google provider, `session: { strategy: 'jwt' }`, no adapter.

The `signIn` callback calls `validateSignIn()` in `database.js`, which returns either a
user or one `SIGNIN_REJECTION` reason. The `jwt` and `session` callbacks attach
`userId`, `role`, and `teamId`.

Every authentication attempt, successful or failed, writes an audit record (`FR-1.6`).

All Auth.js usage is confined to `auth.js` and a thin session accessor, so replacing the
library later touches two files. See §7 risk R-1.

### 4.6 App shell and the 22 routes

The shell renders navigation for the nine modules, filtered by the viewer's permissions
derived from the `session.user` prop. `/signin`, `/403`, and `/404` are fully built.

The other 21 screens are **structural stubs**: correct title, nav highlight, permission
gate, and the tabs, columns, and filters `list-of-screens.md` documents for each — laid
out as an empty skeleton with an explicit not-implemented state.

Shared components built once and reused: `PageHeader`, `EmptyState`, `NotImplemented`,
`PermissionGate`, plus the three cross-cutting popups — `ReasonDialog` (`P-46`),
`StaleWriteDialog` (`P-47`), `RecordHistoryDrawer` (`P-45`).

Every dialog is a real `<form onSubmit>` with `event.preventDefault()`, `type='submit'`
on the primary button and `type='button'` on every other, so Enter submits and Esc
cancels.

### 4.7 The vertical slice — M-3 People

| Surface | Behaviour |
| ------- | --------- |
| `S-06` roster | Server-paged and filterable. A soft-deleted user stays listed, marked *no longer active*, excluded from the active count and from every picker offering a subject for a new record (`FR-2.4`). An untracked user is marked as such (`FR-2.10`). |
| `S-07` detail | Overview, Tenures, and History tabs live. The remaining four tabs are stubs. The derived employment period and any gaps are shown explicitly (`FR-2.12`). |
| `P-08` create | Full name, employee code, optional work email, team, employment type, tracked, role, shift. Employee code unique across **all** users including soft-deleted ones (`FR-2.6`). |
| `P-15` soft delete | Requires a date of leaving, which closes the open tenure. Runs the `FR-2.11` out-of-period check and raises an approval when records fall outside. Access is revoked immediately and never waits for that approval. |
| `P-16` restore | Correction reopens the most recent tenure; re-hire opens a new one from a supplied start date. Both clear `deletedAt` and the date of leaving. |

Date of joining and date of leaving are written in the same operation as any tenure
change, so they cannot drift from the tenures (`FR-2.12`, `DC-4`).

API surface:

```
GET    /api/users                    list, paged and filtered
POST   /api/users                    create
GET    /api/users/[id]               read one
PATCH  /api/users/[id]               update
POST   /api/users/[id]/soft-delete   requires dateOfLeaving + reason
POST   /api/users/[id]/restore       requires case + reason
```

Every mutation writes an audit record carrying actor, action, entity type and id, before
state, after state, and time (`FR-9.1`, `FR-9.2`). Every mutation takes a `version` and
returns `409` with the current state when it is stale, which the UI surfaces as `P-47`.

### 4.8 `scripts/seed.js`

Loads the whole of §3.10: four roles with the complete permission catalog and their
scopes; employment types `PERMANENT`, `CONTRACT`, `SUPPORT_STAFF`, `INTERN`; leave types
10 Annual, 10 Sick, 10 Casual; the Leave Deduction, PTO award, and CTO application
ladders; shift windows 09:00–18:00 and 10:00–19:00; the GC night shift 19:00–04:00
(`BR-3`); Sales & Marketing on US Pacific (`BR-4`); and every threshold and window
(`BR-5`, `BR-16`, `BR-22`–`BR-27`).

Plus demo users spread across those teams, including one untracked support-staff user
with no work email, so `FR-2.10` and `FR-1.5` are demonstrable without hand-entry.

The seed is idempotent (`NFR-15`): running it twice does not duplicate anything.

---

## 5. Error handling

| Situation | Behaviour | From |
| --------- | --------- | ---- |
| No session | Redirect to `/signin` | `FR-1.1` |
| Signed in, permission not held | Redirect to `/403`, naming the missing permission | `S-02`, `NFR-7` |
| Record outside the viewer's scope | `404`, never `403` — existence is not leaked | `S-03` |
| Sign-in rejected | One of five distinct messages, never a generic failure | `S-01`, `FR-1.5` |
| Stale write | `409` with the current state, surfaced as `P-47` | `NFR-14`, `DC-9` |
| Required configuration missing | Prompt naming the entity and field; queued on `S-05`; never guessed or defaulted | `FR-3.13`, `DC-6` |
| Any override, soft delete, or correction | Blocked until a reason is typed, via `P-46` | `FR-4.10` |

`DC-6` governs throughout: no fallback ever hides a gap. No default shift, no default
timezone, no silent zero.

---

## 6. Testing

Vitest is already configured with two projects: `node` for `*.test.js` and `jsdom` for
`*.test.jsx`. Everything is written test-first.

| Unit | Coverage |
| ---- | -------- |
| `authz/check.js` | Every role × permission × scope combination, including the `OFFICE_ADMIN` superset invariant and attempts to breach it. |
| `database.js` | Valid input, invalid input rejected with a specific error, driver failure handled, one edge case each. The driver is mocked. |
| `validateSignIn()` | All five rejection reasons plus the success path. |
| User lifecycle | Create, soft delete closing the tenure, restore as correction, restore as re-hire, and the joining/leaving date invariant. |
| API contracts | Request shape and response shape asserted from **both** sides — the handler fulfils it and the client hook consumes it — in the same change. |
| Components | Roster and detail: state, variant, role, visibility, enabled/disabled. Never token values. |
| Theme | `app/__tests__/theme.test.js` only. |

Tests assert observable behavior. A design-token change must not break an app test, and
a behavior-preserving refactor must not break any test.

---

## 7. Risks

**R-1 — `next-auth` v5 is pre-release.** npm `latest` is `4.24.15`; v5 is
`5.0.0-beta.32`. v4 is not App-Router-first, so v5 is the correct choice, but it is beta.
*Mitigation:* all Auth.js usage is confined to `auth.js` and a thin session accessor.
Replacing it touches two files, not the application.

**R-2 — MUI v9 is a recent major.** Pre-v9 patterns are widespread in training data and
in most online examples. *Mitigation:* `CLAUDE.md` already bans the specific pre-v9
patterns; APIs are verified against the v9 documentation via Context7 rather than
recalled, and any icon name is confirmed to exist in `@mui/icons-material` before use.

**R-3 — `CLAUDE.md` contradicted itself on theme file paths.** Resolved by D-5; the rule
is corrected in the same commit.

---

## 8. Definition of done

1. `npm run lint` exits zero.
2. `npm test` passes.
3. `npm run build` succeeds.
4. `npm run seed` populates a clean database and is safe to re-run.
5. A seeded user signs in with Google and lands on `S-04`.
6. All 22 routes resolve, gated by permission.
7. The People slice creates, soft deletes, and restores a user, writing audit records.
8. Narrowing a permission scope on the grants collection changes access on the **next
   request**, with no restart and no redeploy — the `FR-1.2` proof, and MVP criterion 7.
9. `README.md` brings a new developer to a running app in one command (`NFR-13`, `DC-13`).

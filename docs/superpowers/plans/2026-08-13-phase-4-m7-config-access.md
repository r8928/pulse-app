# Phase 4 · Branch 1 · M-7 Config and Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `S-18` and `S-19` stubs with working screens, so `OFFICE_ADMIN` can edit employment types, authorised sign-in domains and every permission grant at runtime with no redeploy.

**Architecture:** Server components read the session and data and pass plain props to pure client leaves; client leaves call `hooks/`, which call API routes; routes run the record check via `authz/guard.js` and every query goes through `database.js`. `validateGrants` runs in the route handler on the *resulting* grant set, so `FR-1.3` holds regardless of what the client sends.

**Tech Stack:** Next.js 16 (App Router, `proxy.js` on Node runtime) · MUI v9 · MongoDB 7 driver · Zod 4 · Vitest 4 (`node` + `jsdom` projects) · `mongodb-memory-server` (new).

## Global Constraints

Copied verbatim from `CLAUDE.md`, `ARCHITECTURE.md` and the design record. Every task's requirements implicitly include this section.

- **Every MongoDB query lives in `database.js`.** No query in a `page.js`, route handler or component, including single-caller ones.
- **`proxy.js` is the only auth validator.** Never add a guard or unauthenticated redirect to a page or route.
- **Two authorization checks, always** (`I-4`): `proxy.js` gates the endpoint, the handler gates the record via `assertPermission` + `assertRecordInScope`.
- **Never cache permission grants.** `getPermissionGrants()` reads per request. A cache breaks `FR-1.2` and MVP criteria 4 and 7.
- **Every mutation takes and checks a `version`**, answers `409` with `current` in the body, and **writes an audit record in the same handler** with full `before`/`after` documents, never a diff.
- **Nothing is destroyed** (`I-1`). Soft delete sets `deletedAt`. No hard-delete function may be added.
- **No fallback hides a gap** (`I-5`, `DC-6`). A missing required value raises a stated rejection or prompt, never a default or a silent zero.
- **Client components never read the session.** They receive `user.permissions` and branch on it. Never `user.role === 'OFFICE_ADMIN'`.
- **Server components must not pass functions to client components.** `component={Link}` on an MUI component fails the build; use `href`.
- **Serialise before crossing the server/client boundary.** `String(_id)` and `.toISOString()`.
- **MUI v9 only**: `sx` for layout, `slotProps.<slot>` (never `InputLabelProps`/`inputProps`), Grid `size` (never `xs`/`sm`/`md`), Stack/Grid as containers (never Box). On a labelled select with a `<MenuItem value=''>`, always set `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}`.
- **No design tokens in components.** Hexes live in `app/theme/colors.js`; radii/shadows/spacing/typography in `app/theme/theme.js`. Never set `fontSize`/`fontWeight`/`fontFamily` outside the theme — use variants (`pageTitle`, `sectionTitle`, `metricLabel`, `metricValue`, `mono`, `bodyStrong`).
- **Status is never colour alone** (`NFR-12`, `DC-11`): icon **plus** written label, via the theme's `statusSuccess`/`statusWarning`/`statusDanger`/`statusInfo`/`statusNeutral` chip variants. Never an `sx` severity map.
- **No custom margin/padding in `sx`.** Use `spacing`/`gap` on Stack, `spacing`/`rowSpacing`/`columnSpacing` on Grid.
- **Verify every `@mui/icons-material` import exists** before using it: `ls node_modules/@mui/icons-material/<Name>.js`.
- **Forms**: a real `<form onSubmit>` with `event.preventDefault()`, `type='submit'` on the primary button, `type='button'` on every other button.
- **No domain enum literals inline.** Import from `constants/index.js`.
- **The React Context API is not allowed.**
- **Dates**: `date-fns` / `date-fns-tz` only. Never `new Date()` for parsing or arithmetic. Calendar dates are `'YYYY-MM-DD'` strings; instants are `Date` in UTC.
- **`npm run lint` must exit 0 before any commit.** Never `--no-verify`. Run `npm run lint:fix` twice after large edits.
- **Test file naming is load-bearing**: `__tests__/*.test.js` runs in the `node` project, `__tests__/*.test.jsx` runs in `jsdom`. A component test named `.test.js` will fail with no DOM.
- **Branch**: all work on `phase-4-m7-config-access`, squash-merged to `main` at the end.

---

## File Structure

**Created**

| File | Responsibility |
| ---- | -------------- |
| `test/mongo.js` | In-memory MongoDB lifecycle for `node` tests. One export: `useTestDatabase()`. |
| `hooks/useMutations.js` | The shared client mutation primitive: pending, error, 409-as-conflict, `router.refresh()`. |
| `hooks/useConfigMutations.js` | The M-7 write surface, built on `useMutations`. |
| `app/api/employment-types/route.js` | `GET` list, `POST` create. |
| `app/api/employment-types/[id]/route.js` | `PATCH` rename. |
| `app/api/employment-types/[id]/soft-delete/route.js` | `POST` soft delete. |
| `app/api/authorised-domains/route.js` | `GET` list, `POST` add. |
| `app/api/authorised-domains/[id]/soft-delete/route.js` | `POST` remove. |
| `app/api/permission-grants/route.js` | `GET` full matrix, `PATCH` one cell. |
| `components/CompanySettings.jsx` | `S-18` client leaf: two panels plus the no-timezone notice. |
| `components/EmploymentTypeDialog.jsx` | `P-40` create/rename form. |
| `components/DomainDialog.jsx` | `P-41` add form. |
| `components/AccessMatrix.jsx` | `S-19` matrix plus the `P-42` scope dialog. |
| `__tests__/database.employmentTypes.test.js` | Real-database tests for the employment-type queries. |
| `__tests__/database.authorisedDomains.test.js` | Real-database tests for the domain queries. |
| `__tests__/database.permissionGrants.test.js` | Real-database tests for the grant queries. |
| `__tests__/api.employmentTypes.test.js` | Route contract, server side. |
| `__tests__/api.authorisedDomains.test.js` | Route contract, server side. |
| `__tests__/api.permissionGrants.test.js` | Route contract, server side, including `FR-1.3` and MVP criterion 7. |
| `hooks/__tests__/useConfigMutations.test.jsx` | Route contract, client side. |
| `components/__tests__/AccessMatrix.test.jsx` | Matrix behaviour. |
| `components/__tests__/CompanySettings.test.jsx` | Panel behaviour. |

**Modified**

| File | Change |
| ---- | ------ |
| `database.js` | Three Zod schemas, a duplicate-key translator, `employmentTypes` unique index, eleven query functions. |
| `authz/routes.js` | Five API route rules. |
| `hooks/useUserMutations.js` | Rebuilt on `useMutations`; public shape unchanged. |
| `app/(app)/settings/page.js` | Stub → server component feeding `CompanySettings`. |
| `app/(app)/settings/access/page.js` | Stub → server component feeding `AccessMatrix`. |
| `package.json` | `mongodb-memory-server` devDependency. |
| `CLAUDE.md` | Record the `D-6` testing deviation. |
| `ARCHITECTURE.md` | §11.2 amended; §29 marked built. |
| `README.md` | Feature table. |

---

### Task 1: Real in-memory database for tests

Establishes decision `D-6`. Nothing else can be tested until this works, and it carries a real risk: `mongodb-memory-server` downloads a `mongod` binary on first use. **Verify this task end to end before starting Task 2.**

**Files:**
- Create: `test/mongo.js`
- Create: `__tests__/database.harness.test.js`
- Modify: `package.json`, `CLAUDE.md`, `ARCHITECTURE.md:636-645`

**Interfaces:**
- Consumes: `getDb`, `ensureIndexes`, `createUser`, `softDeleteUser`, `listUsers` from `database.js`.
- Produces: `useTestDatabase()` — call once at the top of any `node` test file's `describe`. Sets `MONGODB_URI`/`MONGODB_DB`, runs `ensureIndexes()` once, empties every collection between tests, and closes the client and server afterwards.

- [ ] **Step 1: Install the dependency**

```bash
npm install --save-dev mongodb-memory-server
```

- [ ] **Step 2: Write the harness**

Create `test/mongo.js`:

```js
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { ensureIndexes, getDb } from '../database.js';

/**
 * A real MongoDB engine per test file (design record D-6).
 *
 * This deviates from CLAUDE.md's "mock databases" deliberately. The value of a
 * query function is the query: against a mock, a wrong filter, a missing
 * `deletedAt: null`, a broken unique index and a failed version check all pass
 * green, because the assertion only proves the driver was called.
 *
 * `database.js` caches its client on `globalThis`, so the connection string
 * must be in the environment before the first `getDb()` — which happens inside
 * a test, after `beforeAll`, because every query function is lazy.
 */
export function useTestDatabase() {
  let server;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    process.env.MONGODB_URI = server.getUri();
    process.env.MONGODB_DB = 'pulse-test';
    await ensureIndexes();
  });

  afterEach(async () => {
    const db = await getDb();
    const collections = await db.collections();
    // Empties documents but keeps indexes, so every test still runs against
    // the real unique constraints.
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    const client = await globalThis.__pulseMongoClient;
    await client?.close();
    globalThis.__pulseMongoClient = undefined;
    await server?.stop();
  });
}
```

- [ ] **Step 3: Write the failing test**

Create `__tests__/database.harness.test.js`. These four assertions are the ones a mock cannot make:

```js
import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import { StaleWriteError, createUser, listUsers, softDeleteUser } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const user = (overrides = {}) => ({
  fullName: 'Alice Adeyemi',
  employeeCode: 'EMP-001',
  employmentType: 'PERMANENT',
  tracked: true,
  loginEnabled: true,
  role: ROLES.EMPLOYEE,
  dateOfJoining: '2026-01-05',
  ...overrides,
});

describe('the test database', () => {
  useTestDatabase();

  it('rejects a duplicate employee code, including against a soft-deleted user', async () => {
    // FR-2.6: unique across all users, so a departed user's records are never
    // reattached to a new joiner.
    const created = await createUser(user(), actor);
    await softDeleteUser(
      String(created._id),
      { dateOfLeaving: '2026-06-30', reason: 'Left the company' },
      actor,
      created.version,
    );

    await expect(createUser(user({ fullName: 'Bob Brand' }), actor)).rejects.toThrow();
  });

  it('counts soft-deleted users in the roster but not in the active count', async () => {
    // Totals exclude, rosters include (ARCHITECTURE 5.2).
    const kept = await createUser(user(), actor);
    await createUser(user({ employeeCode: 'EMP-002', fullName: 'Bob Brand' }), actor);
    await softDeleteUser(
      String(kept._id),
      { dateOfLeaving: '2026-06-30', reason: 'Left the company' },
      actor,
      kept.version,
    );

    const { total, activeCount } = await listUsers();
    expect(total).toBe(2);
    expect(activeCount).toBe(1);
  });

  it('rejects a second write against the version the first one consumed', async () => {
    const created = await createUser(user(), actor);
    const body = { dateOfLeaving: '2026-06-30', reason: 'Left the company' };

    await softDeleteUser(String(created._id), body, actor, created.version);

    await expect(
      softDeleteUser(String(created._id), body, actor, created.version),
    ).rejects.toThrow(StaleWriteError);
  });

  it('empties the database between tests', async () => {
    const { total } = await listUsers();
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 4: Run it**

```bash
npx vitest run __tests__/database.harness.test.js
```

Expected: PASS. The first run downloads a `mongod` binary — allow a few minutes and network access. **If the download fails, stop and report it: the whole branch's test strategy depends on this task, and the fallback (driver mocks per `CLAUDE.md`) changes every subsequent task.**

- [ ] **Step 5: Record the deviation in `CLAUDE.md`**

Under `## Testing`, replace the sentence `Mock AWS SDKs, network calls, databases, ConfigService env vars, and framework APIs.` with:

```markdown
- Mock AWS SDKs, network calls, ConfigService env vars, and framework APIs. **`database.js` is the exception**: it is tested against a real in-memory MongoDB via `test/mongo.js`, because a mocked driver cannot fail a wrong filter, a missing `deletedAt: null`, a broken unique index or a stale-version check. See `docs/superpowers/specs/2026-08-13-phase-4-design.md` `D-6`.
```

- [ ] **Step 6: Record it in `ARCHITECTURE.md` §11.2**

In the table at `ARCHITECTURE.md:641`, change the `database.js` row's Test cell from `… Mock the driver.` to `… **Against a real in-memory MongoDB** (`test/mongo.js`), not a mocked driver — see design record `D-6`.`

- [ ] **Step 7: Verify the whole suite still passes and commit**

```bash
npm test && npm run lint
git add -A
git commit -m "test: run database.js against a real in-memory MongoDB"
```

---

### Task 2: Extract the shared mutation hook

`useConfigMutations` is the second cross-file use of the fetch/pending/409 machinery, which is the point `CLAUDE.md` requires extraction. It also needs `PATCH`, which `useUserMutations` does not have.

**Files:**
- Create: `hooks/useMutations.js`
- Modify: `hooks/useUserMutations.js`
- Create: `hooks/__tests__/useMutations.test.jsx`

**Interfaces:**
- Produces: `useMutations()` → `{ pending, error, conflict, dismissConflict, post(url, body), patch(url, body) }`. `post` and `patch` each resolve to `true` on success and `false` on failure, having already called `router.refresh()` on success. **The boolean return is load-bearing** — `UserFormDialog` and `ReasonDialog` both close only on a truthy result.

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useMutations.test.jsx`:

```jsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutations } from '../useMutations.js';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const respond = (status, body) =>
  vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  });

describe('useMutations', () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it('sends a JSON body and refreshes the server-rendered screen on success', async () => {
    global.fetch = respond(200, { _id: '1' });
    const { result } = renderHook(() => useMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.post('/api/things', { name: 'Annual' });
    });

    expect(outcome).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/things', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Annual' }),
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('surfaces a 400 as a readable error and does not refresh', async () => {
    global.fetch = respond(400, { error: 'Full name is required' });
    const { result } = renderHook(() => useMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.patch('/api/things/1', { version: 1 });
    });

    expect(outcome).toBe(false);
    await waitFor(() => expect(result.current.error).toBe('Full name is required'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces a 409 as a conflict carrying the current state, not as an error', async () => {
    // NFR-14, P-47: two administrators need to see what the other did.
    global.fetch = respond(409, {
      error: 'This record changed since you loaded it.',
      current: { _id: '1', version: 4 },
    });
    const { result } = renderHook(() => useMutations());

    await act(async () => {
      await result.current.patch('/api/things/1', { version: 1 });
    });

    await waitFor(() => expect(result.current.conflict).toEqual({ _id: '1', version: 4 }));
    expect(result.current.error).toBeNull();

    act(() => result.current.dismissConflict());
    expect(result.current.conflict).toBeNull();
  });

  it('sends PATCH when asked to patch', async () => {
    global.fetch = respond(200, {});
    const { result } = renderHook(() => useMutations());

    await act(async () => {
      await result.current.patch('/api/things/1', { version: 1 });
    });

    expect(global.fetch.mock.calls[0][1].method).toBe('PATCH');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run hooks/__tests__/useMutations.test.jsx
```

Expected: FAIL — `Failed to resolve import "../useMutations.js"`.

- [ ] **Step 3: Write the hook**

Create `hooks/useMutations.js`:

```js
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The client half of every mutation contract.
 *
 * Components stay pure — data in via props, actions out via callbacks — so
 * fetching, pending state and error handling live here rather than in a
 * screen.
 *
 * A 409 carries the current server state. It is surfaced as `conflict` rather
 * than a plain error because P-47 has to display what the record looks like
 * now for two administrators to reconcile (NFR-14).
 */
async function send(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error ?? 'The request failed.');
    error.status = response.status;
    error.current = payload.current ?? null;
    throw error;
  }

  return payload;
}

export function useMutations() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  const run = async (action) => {
    setPending(true);
    setError(null);
    setConflict(null);

    try {
      await action();
      // The screens are server-rendered, so refreshed data comes from the
      // server rather than from optimistic local state that could drift.
      router.refresh();
      return true;
    } catch (caught) {
      if (caught.status === 409) {
        setConflict(caught.current);
      } else {
        setError(caught.message);
      }
      return false;
    } finally {
      setPending(false);
    }
  };

  return {
    pending,
    error,
    conflict,
    dismissConflict: () => setConflict(null),
    post: (url, body) => run(() => send('POST', url, body)),
    patch: (url, body) => run(() => send('PATCH', url, body)),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run hooks/__tests__/useMutations.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Rebuild `useUserMutations` on it**

Replace the whole of `hooks/useUserMutations.js` with:

```js
'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of the user lifecycle. The fetch, pending, error and 409
 * machinery is shared with every other mutation surface in `useMutations`.
 */
export function useUserMutations() {
  const { post, ...state } = useMutations();

  return {
    ...state,
    createUser: (data) => post('/api/users', data),
    softDeleteUser: (id, data) => post(`/api/users/${id}/soft-delete`, data),
    restoreUser: (id, data) => post(`/api/users/${id}/restore`, data),
  };
}
```

- [ ] **Step 6: Verify nothing regressed and commit**

```bash
npm test && npm run lint
git add -A
git commit -m "refactor: extract the shared client mutation hook"
```

Expected: PASS. `useUserMutations`'s public shape is unchanged, so `UserRoster` and `UserDetail` need no edit — if either breaks, the extraction is wrong, not the caller.

---

### Task 3: Employment-type queries

**Files:**
- Modify: `database.js`
- Create: `__tests__/database.employmentTypes.test.js`

**Interfaces:**
- Produces:
  - `listEmploymentTypes({ includeDeleted = false, companyId } = {})` → `{ items, total }`
  - `createEmploymentType({ name }, actor, companyId)` → the document
  - `updateEmploymentType(id, { name }, version, actor, companyId)` → the document, or `null` when absent
  - `softDeleteEmploymentType(id, { reason }, version, actor, companyId)` → the document, or `null` when absent
  - `ValidationError` is thrown for a duplicate name and for a type still in use.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database.employmentTypes.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  StaleWriteError,
  ValidationError,
  createEmploymentType,
  createUser,
  listEmploymentTypes,
  softDeleteEmploymentType,
  updateEmploymentType,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('employment types', () => {
  useTestDatabase();

  it('creates one and lists it', async () => {
    await createEmploymentType({ name: 'PERMANENT' }, actor);
    const { items, total } = await listEmploymentTypes();

    expect(total).toBe(1);
    expect(items[0].name).toBe('PERMANENT');
    expect(items[0].version).toBe(1);
    expect(items[0].deletedAt).toBeNull();
  });

  it('rejects a duplicate name with the name stated', async () => {
    await createEmploymentType({ name: 'PERMANENT' }, actor);

    await expect(createEmploymentType({ name: 'PERMANENT' }, actor)).rejects.toThrow(
      /PERMANENT/,
    );
  });

  it('rejects an empty name rather than storing one', async () => {
    await expect(createEmploymentType({ name: '  ' }, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it('renames one and bumps its version', async () => {
    const created = await createEmploymentType({ name: 'CONTRACT' }, actor);
    const renamed = await updateEmploymentType(
      String(created._id),
      { name: 'FIXED_TERM' },
      created.version,
      actor,
    );

    expect(renamed.name).toBe('FIXED_TERM');
    expect(renamed.version).toBe(2);
  });

  it('rejects a rename against a stale version', async () => {
    const created = await createEmploymentType({ name: 'CONTRACT' }, actor);
    await updateEmploymentType(String(created._id), { name: 'A' }, created.version, actor);

    await expect(
      updateEmploymentType(String(created._id), { name: 'B' }, created.version, actor),
    ).rejects.toThrow(StaleWriteError);
  });

  it('refuses to soft delete one still held by a user who is not soft deleted', async () => {
    // The FR-3.2 rule for teams, applied to the other company-wide list:
    // name the holders so they can be moved first.
    const created = await createEmploymentType({ name: 'INTERN' }, actor);
    await createUser(
      {
        fullName: 'Ivy Tanaka',
        employeeCode: 'INT-001',
        employmentType: 'INTERN',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-05',
      },
      actor,
    );

    await expect(
      softDeleteEmploymentType(
        String(created._id),
        { reason: 'No longer used' },
        created.version,
        actor,
      ),
    ).rejects.toThrow(/Ivy Tanaka/);
  });

  it('soft deletes an unused one and drops it from the default list', async () => {
    const created = await createEmploymentType({ name: 'INTERN' }, actor);
    const deleted = await softDeleteEmploymentType(
      String(created._id),
      { reason: 'No longer used' },
      created.version,
      actor,
    );

    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect((await listEmploymentTypes()).total).toBe(0);
    expect((await listEmploymentTypes({ includeDeleted: true })).total).toBe(1);
  });

  it('answers null for an id that does not exist rather than throwing', async () => {
    expect(await updateEmploymentType('not-an-id', { name: 'X' }, 1, actor)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run __tests__/database.employmentTypes.test.js
```

Expected: FAIL — `createEmploymentType is not a function`.

- [ ] **Step 3: Add the duplicate-key translator and the index**

In `database.js`, immediately after the `parse` helper (currently line 169-175), add:

```js
/**
 * MongoDB reports a unique-index violation as error code 11000, which would
 * otherwise reach `errorResponse` as an unknown error and become a 500. Every
 * uniqueness rule in the spec requires the offending value to be *named* —
 * FR-2.6 for an employee code, FR-3.2 for a team — so it is translated here
 * into the same ValidationError a Zod failure produces.
 */
function rethrowDuplicateAs(error, message) {
  if (error?.code === 11000) throw new ValidationError(message);
  throw error;
}
```

In `ensureIndexes()`, after the `AUTHORISED_DOMAINS` block (currently line 210-212), add:

```js
  await db
    .collection(COLLECTIONS.EMPLOYMENT_TYPES)
    .createIndexes([{ key: { companyId: 1, name: 1 }, unique: true }]);
```

- [ ] **Step 4: Add the schema**

In `database.js`, after `restoreUserSchema`, add:

```js
/** FR-2.6: employment types are company-wide configuration, not an enum. */
export const employmentTypeSchema = z.object({
  name: z.string().trim().min(1, 'A name is required'),
});
```

- [ ] **Step 5: Write the query functions**

Append a new section to `database.js`, after the Approvals section:

```js
// --- Employment types ------------------------------------------------------

/**
 * FR-2.6 and FR-6.4. Company-wide configuration, editable at runtime.
 *
 * Unpaged deliberately: this list is bounded by configuration rather than by
 * the roster, so NFR-3 does not apply to it. Every collection that grows with
 * the roster pages.
 */
export async function listEmploymentTypes({
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.EMPLOYMENT_TYPES)
    .find(filter)
    .sort({ name: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

export async function createEmploymentType(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(employmentTypeSchema, input);
  const db = await getDb();
  const now = new Date();

  const doc = {
    ...data,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  let insertedId;
  try {
    ({ insertedId } = await db
      .collection(COLLECTIONS.EMPLOYMENT_TYPES)
      .insertOne(doc));
  } catch (error) {
    rethrowDuplicateAs(error, `An employment type named ${data.name} already exists.`);
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'EMPLOYMENT_TYPE_CREATED',
    entityType: 'employmentType',
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

export async function updateEmploymentType(
  id,
  patch,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.EMPLOYMENT_TYPES);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const data = parse(employmentTypeSchema, patch);

  let after;
  try {
    after = await updateWithVersion(
      COLLECTIONS.EMPLOYMENT_TYPES,
      id,
      version,
      {
        $set: { ...data, updatedAt: new Date(), updatedBy: actor.userId },
        $inc: { version: 1 },
      },
      companyId,
    );
  } catch (error) {
    rethrowDuplicateAs(error, `An employment type named ${data.name} already exists.`);
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'EMPLOYMENT_TYPE_UPDATED',
    entityType: 'employmentType',
    entityId: id,
    before,
    after,
    reason: patch.reason ?? null,
    companyId,
  });

  return after;
}

/**
 * Rejected while any user who is not soft deleted still holds it, naming those
 * users so they can be moved first — the FR-3.2 rule for teams, applied to the
 * other company-wide list. A type held only by departed users may go.
 */
export async function softDeleteEmploymentType(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.EMPLOYMENT_TYPES);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const holders = await db
    .collection(COLLECTIONS.USERS)
    .find({ companyId, employmentType: before.name, deletedAt: null })
    .project({ fullName: 1 })
    .limit(10)
    .toArray();

  if (holders.length > 0) {
    throw new ValidationError(
      `${before.name} is still held by ${holders.map((h) => h.fullName).join(', ')}. Move them to another employment type first.`,
    );
  }

  const after = await updateWithVersion(
    COLLECTIONS.EMPLOYMENT_TYPES,
    id,
    version,
    {
      $set: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'EMPLOYMENT_TYPE_SOFT_DELETED',
    entityType: 'employmentType',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}
```

Add `reasonSchema` beside `employmentTypeSchema`, since three soft deletes in this branch use it:

```js
/** FR-4.10: every soft delete states its reason, recorded in the audit log. */
export const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run __tests__/database.employmentTypes.test.js
```

Expected: PASS, all eight.

- [ ] **Step 7: Commit**

```bash
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: employment type queries with uniqueness and in-use guards"
```

---

### Task 4: Employment-type API routes

**Files:**
- Create: `app/api/employment-types/route.js`, `app/api/employment-types/[id]/route.js`, `app/api/employment-types/[id]/soft-delete/route.js`
- Modify: `authz/routes.js`
- Create: `__tests__/api.employmentTypes.test.js`

**Interfaces:**
- Consumes: the four functions from Task 3; `requireActor`, `assertPermission`, `assertRecordInScope` from `authz/guard.js`; `errorResponse` from `utils/apiResponse.js`.
- Produces the contract the Task 9 hook consumes:

| Method | Path | Body | Success | Permission |
| --- | --- | --- | --- | --- |
| `GET` | `/api/employment-types` | — | `200 { items, total }` | `config.read` |
| `POST` | `/api/employment-types` | `{ name }` | `201 <doc>` | `config.write` |
| `PATCH` | `/api/employment-types/[id]` | `{ name, version }` | `200 <doc>` | `config.write` |
| `POST` | `/api/employment-types/[id]/soft-delete` | `{ reason, version }` | `200 <doc>` | `config.write` |

- [ ] **Step 1: Write the failing contract test**

Create `__tests__/api.employmentTypes.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { createEmploymentType } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const { GET, POST } = await import('../app/api/employment-types/route.js');
const { PATCH } = await import('../app/api/employment-types/[id]/route.js');
const { POST: SOFT_DELETE } = await import(
  '../app/api/employment-types/[id]/soft-delete/route.js'
);

const signedInAs = (permissions) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Office Administrator',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
  });

const held = (...names) => Object.fromEntries(names.map((n) => [n, SCOPES.ALL]));

const json = (body) =>
  new Request('http://localhost/api/employment-types', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('/api/employment-types', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await GET(json({}))).status).toBe(401);
  });

  it('answers 403 naming the permission when the reader lacks config.read', async () => {
    signedInAs(held(PERMISSIONS.USER_READ));

    const response = await GET(json({}));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      permission: PERMISSIONS.CONFIG_READ,
    });
  });

  it('lists types for a reader holding config.read', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    await createEmploymentType({ name: 'PERMANENT' }, actor);

    const response = await GET(json({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1 });
  });

  it('answers 403 on a create by a reader who holds only config.read', async () => {
    // proxy.js gates the path on config.read; only the handler knows a POST
    // needs config.write.
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    expect((await POST(json({ name: 'CONTRACT' }))).status).toBe(403);
  });

  it('creates and answers 201 with the document', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ name: 'CONTRACT' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'CONTRACT', version: 1 });
  });

  it('answers 400 with the specific message on an invalid name', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ name: '' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/name is required/i);
  });

  it('answers 409 carrying the current state on a stale rename', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    const created = await createEmploymentType({ name: 'CONTRACT' }, actor);
    const params = Promise.resolve({ id: String(created._id) });

    await PATCH(json({ name: 'A', version: 1 }), { params });
    const response = await PATCH(json({ name: 'B', version: 1 }), { params });

    expect(response.status).toBe(409);
    expect((await response.json()).current).toMatchObject({ name: 'A' });
  });

  it('answers 404 for an id that does not exist', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await PATCH(json({ name: 'A', version: 1 }), {
      params: Promise.resolve({ id: '000000000000000000000000' }),
    });
    expect(response.status).toBe(404);
  });

  it('soft deletes and requires a reason', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    const created = await createEmploymentType({ name: 'INTERN' }, actor);
    const params = Promise.resolve({ id: String(created._id) });

    const rejected = await SOFT_DELETE(json({ reason: '', version: 1 }), { params });
    expect(rejected.status).toBe(400);

    const accepted = await SOFT_DELETE(
      json({ reason: 'No longer used', version: 1 }),
      { params },
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).deletedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run __tests__/api.employmentTypes.test.js
```

Expected: FAIL — cannot resolve `../app/api/employment-types/route.js`.

- [ ] **Step 3: Add the route rules**

In `authz/routes.js`, in the API block after the `/api/users/...` rules, add:

```js
  // Company-wide configuration. The path gates on config.read; a POST or PATCH
  // asserts config.write in the handler, because the required permission
  // depends on the method rather than the path.
  {
    pattern: /^\/api\/employment-types(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/employment-types\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
```

- [ ] **Step 4: Write the collection route**

Create `app/api/employment-types/route.js`:

```js
import { NextResponse } from 'next/server';
import { assertPermission, assertRecordInScope, requireActor } from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { createEmploymentType, listEmploymentTypes } from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * P-40. Employment types are company-wide configuration (FR-2.6, FR-6.4).
 *
 * Company-wide records belong to no user and no team, so the record check
 * passes a record with neither: only a scope of ALL reaches it. FR-1.2 requires
 * the record check even where the answer is structural.
 */
export const COMPANY_WIDE = { userId: null, teamId: null };

export async function GET(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_READ);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const url = new URL(request.url);
    return NextResponse.json(
      await listEmploymentTypes({
        includeDeleted: url.searchParams.get('includeDeleted') === 'true',
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const created = await createEmploymentType(await request.json(), actor);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 5: Write the item routes**

Create `app/api/employment-types/[id]/route.js`:

```js
import { NextResponse } from 'next/server';
import { assertPermission, assertRecordInScope, requireActor } from '../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../constants/index.js';
import { updateEmploymentType } from '../../../../database.js';
import { errorResponse } from '../../../../utils/apiResponse.js';
import { COMPANY_WIDE } from '../route.js';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...patch } = await request.json();
    const updated = await updateEmploymentType(id, patch, version, actor);

    if (!updated) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
```

Create `app/api/employment-types/[id]/soft-delete/route.js`:

```js
import { NextResponse } from 'next/server';
import { assertPermission, assertRecordInScope, requireActor } from '../../../../../authz/guard.js';
import { PERMISSIONS } from '../../../../../constants/index.js';
import { softDeleteEmploymentType } from '../../../../../database.js';
import { errorResponse } from '../../../../../utils/apiResponse.js';
import { COMPANY_WIDE } from '../../route.js';

/**
 * P-40's destructive half. Soft delete only — nothing is destroyed (I-1) — and
 * a reason is mandatory (FR-4.10), so the type can still resolve on the record
 * of any user who held it.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.CONFIG_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...body } = await request.json();
    const deleted = await softDeleteEmploymentType(id, body, version, actor);

    if (!deleted) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(deleted);
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run __tests__/api.employmentTypes.test.js
```

Expected: PASS, all nine.

- [ ] **Step 7: Commit**

```bash
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: employment type API with method-level permission checks"
```

---

### Task 5: Authorised-domain queries

**Files:**
- Modify: `database.js`
- Create: `__tests__/database.authorisedDomains.test.js`

**Interfaces:**
- Produces:
  - `listAuthorisedDomains({ includeDeleted, companyId })` → `{ items, total }` (full documents, for `S-18`)
  - `createAuthorisedDomain({ domain }, actor, companyId)` → the document
  - `softDeleteAuthorisedDomain(id, { reason }, version, actor, companyId)` → the document, or `null`
- **Unchanged:** `getAuthorisedDomains()` still returns a plain array of strings for the sign-in hot path. Do not repoint it.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database.authorisedDomains.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  createAuthorisedDomain,
  getAuthorisedDomains,
  listAuthorisedDomains,
  softDeleteAuthorisedDomain,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('authorised domains', () => {
  useTestDatabase();

  it('stores a domain lowercased', async () => {
    await createAuthorisedDomain({ domain: 'Example.COM' }, actor);
    expect((await listAuthorisedDomains()).items[0].domain).toBe('example.com');
  });

  it('rejects something that is not a domain', async () => {
    await expect(
      createAuthorisedDomain({ domain: 'not a domain' }, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an email address, which is the likeliest mistake', async () => {
    await expect(
      createAuthorisedDomain({ domain: 'someone@example.com' }, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a duplicate', async () => {
    await createAuthorisedDomain({ domain: 'example.com' }, actor);
    await expect(
      createAuthorisedDomain({ domain: 'example.com' }, actor),
    ).rejects.toThrow(/example\.com/);
  });

  it('refuses to remove the last one, which would lock everybody out', async () => {
    // FR-1.5 admits a sign-in only from an authorised domain, so an empty list
    // is not a configuration state — it is a lockout with no way back in.
    const only = await createAuthorisedDomain({ domain: 'example.com' }, actor);

    await expect(
      softDeleteAuthorisedDomain(
        String(only._id),
        { reason: 'Wrong domain' },
        only.version,
        actor,
      ),
    ).rejects.toThrow(/last authorised domain/i);
  });

  it('removes one when another remains, and drops it from the sign-in list', async () => {
    const first = await createAuthorisedDomain({ domain: 'old.example' }, actor);
    await createAuthorisedDomain({ domain: 'new.example' }, actor);

    await softDeleteAuthorisedDomain(
      String(first._id),
      { reason: 'Company changed domain' },
      first.version,
      actor,
    );

    expect(await getAuthorisedDomains()).toEqual(['new.example']);
    expect((await listAuthorisedDomains({ includeDeleted: true })).total).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run __tests__/database.authorisedDomains.test.js
```

Expected: FAIL — `createAuthorisedDomain is not a function`.

- [ ] **Step 3: Add the schema**

In `database.js`, beside `employmentTypeSchema`:

```js
/**
 * FR-1.5. A Workspace domain, not an email address — the likeliest mistake is
 * pasting a whole address, which would authorise nobody and be hard to spot.
 */
export const authorisedDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Enter a domain such as example.com, not an email address'),
});
```

- [ ] **Step 4: Write the query functions**

Append to `database.js`, after the employment-type section:

```js
// --- Authorised domains ----------------------------------------------------

/**
 * S-18's read surface: whole documents, so the screen can offer a versioned
 * removal. `getAuthorisedDomains` above stays as it is — the sign-in path wants
 * bare strings and must not pay for anything more.
 */
export async function listAuthorisedDomains({
  includeDeleted = false,
  companyId = DEFAULT_COMPANY_ID,
} = {}) {
  const db = await getDb();
  const filter = { companyId };
  if (!includeDeleted) filter.deletedAt = null;

  const items = await db
    .collection(COLLECTIONS.AUTHORISED_DOMAINS)
    .find(filter)
    .sort({ domain: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

export async function createAuthorisedDomain(
  input,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(authorisedDomainSchema, input);
  const db = await getDb();
  const now = new Date();

  const doc = {
    ...data,
    companyId,
    deletedAt: null,
    version: 1,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
  };

  let insertedId;
  try {
    ({ insertedId } = await db
      .collection(COLLECTIONS.AUTHORISED_DOMAINS)
      .insertOne(doc));
  } catch (error) {
    rethrowDuplicateAs(error, `${data.domain} is already authorised.`);
  }

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'AUTHORISED_DOMAIN_ADDED',
    entityType: 'authorisedDomain',
    entityId: insertedId,
    after: doc,
    companyId,
  });

  return { ...doc, _id: insertedId };
}

/**
 * Refused when it is the last one. FR-1.5 admits a sign-in only from an
 * authorised domain, so an empty list is not a configuration state — it locks
 * every user out, including the OFFICE_ADMIN who would have to undo it.
 */
export async function softDeleteAuthorisedDomain(
  id,
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  if (!ObjectId.isValid(id)) return null;

  const data = parse(reasonSchema, input);
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.AUTHORISED_DOMAINS);
  const before = await collection.findOne({ _id: new ObjectId(id), companyId });
  if (!before) return null;

  const remaining = await collection.countDocuments({ companyId, deletedAt: null });
  if (remaining <= 1) {
    throw new ValidationError(
      `${before.domain} is the last authorised domain. Removing it would prevent every user from signing in, including you. Add the replacement first.`,
    );
  }

  const after = await updateWithVersion(
    COLLECTIONS.AUTHORISED_DOMAINS,
    id,
    version,
    {
      $set: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: actor.userId,
      },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'AUTHORISED_DOMAIN_REMOVED',
    entityType: 'authorisedDomain',
    entityId: id,
    before,
    after,
    reason: data.reason,
    companyId,
  });

  return after;
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run __tests__/database.authorisedDomains.test.js
```

Expected: PASS, all six. If the lowercase test fails, check that `z.string().trim().toLowerCase()` runs before `.regex()` — Zod 4 applies transforms in declaration order.

- [ ] **Step 6: Commit**

```bash
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: authorised domain queries with a last-domain lockout guard"
```

---

### Task 6: Authorised-domain API routes

**Files:**
- Create: `app/api/authorised-domains/route.js`, `app/api/authorised-domains/[id]/soft-delete/route.js`
- Modify: `authz/routes.js`
- Create: `__tests__/api.authorisedDomains.test.js`

**Interfaces:**
- Consumes: Task 5's three functions; `COMPANY_WIDE` from `app/api/employment-types/route.js`.

  **Move `COMPANY_WIDE` first.** It is now used by three route trees, which is the second cross-file use. Relocate it to `authz/guard.js` as an export and update the two Task 4 routes to import it from there:

  ```js
  /**
   * Company-wide configuration belongs to no user and no team, so only a scope
   * of ALL reaches it. FR-1.2 requires the record check even where the answer
   * is structural rather than per-record.
   */
  export const COMPANY_WIDE = Object.freeze({ userId: null, teamId: null });
  ```

- Produces:

| Method | Path | Body | Success | Permission |
| --- | --- | --- | --- | --- |
| `GET` | `/api/authorised-domains` | — | `200 { items, total }` | `config.read` |
| `POST` | `/api/authorised-domains` | `{ domain }` | `201 <doc>` | `config.write` |
| `POST` | `/api/authorised-domains/[id]/soft-delete` | `{ reason, version }` | `200 <doc>` | `config.write` |

- [ ] **Step 1: Move `COMPANY_WIDE` into `authz/guard.js`**

Add the export above, delete it from `app/api/employment-types/route.js`, and change both Task 4 route files to import it from `authz/guard.js` alongside their existing guard imports.

- [ ] **Step 2: Run the Task 4 tests to prove the move is behaviour-preserving**

```bash
npx vitest run __tests__/api.employmentTypes.test.js
```

Expected: PASS, unchanged.

- [ ] **Step 3: Write the failing contract test**

Create `__tests__/api.authorisedDomains.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { createAuthorisedDomain } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const { GET, POST } = await import('../app/api/authorised-domains/route.js');
const { POST: SOFT_DELETE } = await import(
  '../app/api/authorised-domains/[id]/soft-delete/route.js'
);

const held = (...names) => Object.fromEntries(names.map((n) => [n, SCOPES.ALL]));

const signedInAs = (permissions) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Office Administrator',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
  });

const json = (body) =>
  new Request('http://localhost/api/authorised-domains', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('/api/authorised-domains', () => {
  useTestDatabase();

  it('answers 401 when nobody is signed in', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await GET(json({}))).status).toBe(401);
  });

  it('adds a domain and answers 201', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ domain: 'example.com' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ domain: 'example.com' });
  });

  it('answers 400 naming the mistake when given an email address', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));

    const response = await POST(json({ domain: 'someone@example.com' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not an email address/i);
  });

  it('answers 400 rather than removing the last domain', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE));
    const only = await createAuthorisedDomain({ domain: 'example.com' }, actor);

    const response = await SOFT_DELETE(
      json({ reason: 'Wrong domain', version: only.version }),
      { params: Promise.resolve({ id: String(only._id) }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/last authorised domain/i);
  });

  it('answers 403 on a write by a reader holding only config.read', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_READ));
    expect((await POST(json({ domain: 'example.com' }))).status).toBe(403);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
npx vitest run __tests__/api.authorisedDomains.test.js
```

Expected: FAIL — cannot resolve `../app/api/authorised-domains/route.js`.

- [ ] **Step 5: Add the route rules**

In `authz/routes.js`, beside the employment-type rules:

```js
  {
    pattern: /^\/api\/authorised-domains(\/[^/]+)?$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
  {
    pattern: /^\/api\/authorised-domains\/[^/]+\/soft-delete$/,
    permission: PERMISSIONS.CONFIG_READ,
  },
```

- [ ] **Step 6: Write the routes**

Create `app/api/authorised-domains/route.js` with `GET` (asserting `CONFIG_READ`, calling `listAuthorisedDomains`) and `POST` (asserting `CONFIG_WRITE`, calling `createAuthorisedDomain`, answering `201`), following exactly the shape of Task 4's collection route — same imports, same `COMPANY_WIDE` record check, same `errorResponse` wrapper, importing `COMPANY_WIDE` from `../../../authz/guard.js`.

Create `app/api/authorised-domains/[id]/soft-delete/route.js` with a `POST` that asserts `CONFIG_WRITE`, destructures `{ version, ...body }`, calls `softDeleteAuthorisedDomain(id, body, version, actor)`, answers `404` on `null`, and is wrapped in `errorResponse`. Import depth is `../../../../authz/guard.js`.

- [ ] **Step 7: Run the tests and commit**

```bash
npx vitest run __tests__/api.authorisedDomains.test.js
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: authorised domain API"
```

Expected: PASS, all five.

---

### Task 7: Permission-grant queries

**Files:**
- Modify: `database.js`
- Create: `__tests__/database.permissionGrants.test.js`

**Interfaces:**
- Produces:
  - `listPermissionGrants({ companyId })` → `{ items, total }`, whole documents including `_id` and `version`, for `S-19`
  - `setPermissionGrant({ role, permission, scope }, version, actor, companyId)` → the document. `version` is `null` for a cell that has no row yet.
- **Unchanged:** `getPermissionGrants()` keeps its lean projection. `proxy.js` and `session.js` call it on every request; do not repoint them.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database.permissionGrants.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import {
  StaleWriteError,
  getPermissionGrants,
  listPermissionGrants,
  setPermissionGrant,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('permission grants', () => {
  useTestDatabase();

  it('creates a row for a cell that has none, at version 1', async () => {
    const grant = await setPermissionGrant(
      { role: ROLES.EMPLOYEE, permission: PERMISSIONS.CONFIG_READ, scope: SCOPES.SELF },
      null,
      actor,
    );

    expect(grant).toMatchObject({ scope: SCOPES.SELF, version: 1 });
    expect((await listPermissionGrants()).total).toBe(1);
  });

  it('narrows an existing scope and bumps the version', async () => {
    await setPermissionGrant(
      { role: ROLES.MANAGER, permission: PERMISSIONS.LEAVE_APPROVE, scope: SCOPES.ALL },
      null,
      actor,
    );

    const narrowed = await setPermissionGrant(
      { role: ROLES.MANAGER, permission: PERMISSIONS.LEAVE_APPROVE, scope: SCOPES.TEAM },
      1,
      actor,
    );

    expect(narrowed).toMatchObject({ scope: SCOPES.TEAM, version: 2 });
  });

  it('stores a withheld permission as a null scope rather than removing the row', async () => {
    // Design record D-8: nothing is destroyed (I-1), and the row keeps its
    // version for the next edit.
    await setPermissionGrant(
      { role: ROLES.EMPLOYEE, permission: PERMISSIONS.LEAVE_READ, scope: SCOPES.ALL },
      null,
      actor,
    );

    const withheld = await setPermissionGrant(
      { role: ROLES.EMPLOYEE, permission: PERMISSIONS.LEAVE_READ, scope: null },
      1,
      actor,
    );

    expect(withheld.scope).toBeNull();
    expect((await listPermissionGrants()).total).toBe(1);
  });

  it('is read as holding nothing once the scope is null', async () => {
    const { resolveScope } = await import('../authz/check.js');
    await setPermissionGrant(
      { role: ROLES.EMPLOYEE, permission: PERMISSIONS.LEAVE_READ, scope: null },
      null,
      actor,
    );

    const grants = await getPermissionGrants();
    expect(resolveScope(grants, ROLES.EMPLOYEE, PERMISSIONS.LEAVE_READ)).toBeNull();
  });

  it('rejects a second edit against the version the first one consumed', async () => {
    await setPermissionGrant(
      { role: ROLES.IT, permission: PERMISSIONS.USER_WRITE, scope: SCOPES.ALL },
      null,
      actor,
    );
    await setPermissionGrant(
      { role: ROLES.IT, permission: PERMISSIONS.USER_WRITE, scope: SCOPES.TEAM },
      1,
      actor,
    );

    await expect(
      setPermissionGrant(
        { role: ROLES.IT, permission: PERMISSIONS.USER_WRITE, scope: SCOPES.SELF },
        1,
        actor,
      ),
    ).rejects.toThrow(StaleWriteError);
  });

  it('rejects an unknown scope', async () => {
    await expect(
      setPermissionGrant(
        { role: ROLES.IT, permission: PERMISSIONS.USER_WRITE, scope: 'EVERYTHING' },
        null,
        actor,
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run __tests__/database.permissionGrants.test.js
```

Expected: FAIL — `setPermissionGrant is not a function`.

- [ ] **Step 3: Add the schema**

In `database.js`, beside the others. Import `PERMISSIONS`, `SCOPES` at the top of the file alongside the existing `constants/index.js` import:

```js
/**
 * FR-1.2. A cell of the S-19 matrix. A null scope means the role holds the
 * permission at no scope — a row, never a removed one (design record D-8), so
 * nothing is destroyed and the change has a real before and after to audit.
 */
export const permissionGrantSchema = z.object({
  role: z.enum(Object.values(ROLES)),
  permission: z.enum(ALL_PERMISSIONS),
  scope: z.enum(Object.values(SCOPES)).nullable(),
});
```

- [ ] **Step 4: Write the query functions**

Append to `database.js`:

```js
// --- Permission grants -----------------------------------------------------

/**
 * S-19's read surface: whole documents, because the matrix needs each row's
 * version to write a cell back safely.
 *
 * `getPermissionGrants` above stays as it is — proxy.js and session.js call it
 * on every single request and want the lean projection.
 */
export async function listPermissionGrants(companyId = DEFAULT_COMPANY_ID) {
  const db = await getDb();
  const items = await db
    .collection(COLLECTIONS.PERMISSION_GRANTS)
    .find({ companyId })
    .sort({ permission: 1, role: 1, _id: 1 })
    .toArray();

  return { items, total: items.length };
}

/**
 * P-42. Sets the scope one role holds one permission at.
 *
 * FR-1.3 is NOT enforced here: the caller validates the resulting *set* with
 * `validateGrants` before calling, because the rule is about the whole matrix
 * rather than about any one cell. Keeping that in the handler also keeps
 * `database.js` free of an authz import (Part I dependency rules).
 *
 * A cell with no row yet is created; `version` is null in that case. The unique
 * index on (companyId, role, permission) is what makes a concurrent first write
 * fail rather than duplicate.
 */
export async function setPermissionGrant(
  input,
  version,
  actor,
  companyId = DEFAULT_COMPANY_ID,
) {
  const data = parse(permissionGrantSchema, input);
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.PERMISSION_GRANTS);
  const now = new Date();

  const before = await collection.findOne({
    companyId,
    role: data.role,
    permission: data.permission,
  });

  if (!before) {
    const doc = {
      ...data,
      companyId,
      version: 1,
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };

    let insertedId;
    try {
      ({ insertedId } = await collection.insertOne(doc));
    } catch (error) {
      rethrowDuplicateAs(
        error,
        'Another administrator granted this permission at the same moment. Reload and try again.',
      );
    }

    await writeAuditRecord({
      actorId: actor.userId,
      actorName: actor.name,
      action: 'PERMISSION_GRANT_CHANGED',
      entityType: 'permissionGrant',
      entityId: insertedId,
      before: null,
      after: doc,
      reason: input.reason ?? null,
      companyId,
    });

    return { ...doc, _id: insertedId };
  }

  const after = await updateWithVersion(
    COLLECTIONS.PERMISSION_GRANTS,
    String(before._id),
    version,
    {
      $set: { scope: data.scope, updatedAt: now, updatedBy: actor.userId },
      $inc: { version: 1 },
    },
    companyId,
  );

  await writeAuditRecord({
    actorId: actor.userId,
    actorName: actor.name,
    action: 'PERMISSION_GRANT_CHANGED',
    entityType: 'permissionGrant',
    entityId: String(before._id),
    before,
    after,
    reason: input.reason ?? null,
    companyId,
  });

  return after;
}
```

- [ ] **Step 5: Run the tests and commit**

```bash
npx vitest run __tests__/database.permissionGrants.test.js
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: permission grant queries with a null scope for a withheld permission"
```

Expected: PASS, all six.

---

### Task 8: Permission-grant API route

The `FR-1.3` guarantee lives here. This is the highest-value test in the branch.

**Files:**
- Create: `app/api/permission-grants/route.js`
- Modify: `authz/routes.js`
- Create: `__tests__/api.permissionGrants.test.js`

**Interfaces:**
- Consumes: `listPermissionGrants`, `setPermissionGrant`, `getPermissionGrants` from `database.js`; `validateGrants`, `resolveScope` from `authz/check.js`.
- Produces:

| Method | Path | Body | Success | Permission |
| --- | --- | --- | --- | --- |
| `GET` | `/api/permission-grants` | — | `200 { items, total }` | `permission.write` |
| `PATCH` | `/api/permission-grants` | `{ role, permission, scope, reason, version }` | `200 <doc>` | `permission.write` |

`400` carries `validateGrants`'s reason verbatim. `409` carries `current`.

- [ ] **Step 1: Write the failing contract test**

Create `__tests__/api.permissionGrants.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { resolveScope } from '../authz/check.js';
import { ALL_PERMISSIONS, PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { getPermissionGrants, setPermissionGrant } from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const { GET, PATCH } = await import('../app/api/permission-grants/route.js');

const held = (...names) => Object.fromEntries(names.map((n) => [n, SCOPES.ALL]));

const signedInAs = (permissions) =>
  getSessionUser.mockResolvedValue({
    userId: 'actor-1',
    name: 'Office Administrator',
    role: ROLES.OFFICE_ADMIN,
    teamId: null,
    permissions,
  });

const json = (body) =>
  new Request('http://localhost/api/permission-grants', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

/** FR-1.3: OFFICE_ADMIN holds every permission at ALL. */
const seedOfficeAdmin = () =>
  Promise.all(
    ALL_PERMISSIONS.map((permission) =>
      setPermissionGrant(
        { role: ROLES.OFFICE_ADMIN, permission, scope: SCOPES.ALL },
        null,
        actor,
      ),
    ),
  );

describe('/api/permission-grants', () => {
  useTestDatabase();

  it('answers 403 for a viewer without permission.write', async () => {
    signedInAs(held(PERMISSIONS.CONFIG_WRITE));

    const response = await GET(json({}));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      permission: PERMISSIONS.PERMISSION_WRITE,
    });
  });

  it('grants a permission to a role and answers 200', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: ROLES.IT,
        permission: PERMISSIONS.AUDIT_READ,
        scope: SCOPES.ALL,
        reason: 'IT now triages sign-in failures',
        version: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scope: SCOPES.ALL });
  });

  it('takes effect on the very next request, with no restart', async () => {
    // MVP criterion 7, and the whole point of FR-1.2's FGAC half.
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    expect(
      resolveScope(await getPermissionGrants(), ROLES.EMPLOYEE, PERMISSIONS.AUDIT_READ),
    ).toBeNull();

    await PATCH(
      json({
        role: ROLES.EMPLOYEE,
        permission: PERMISSIONS.AUDIT_READ,
        scope: SCOPES.SELF,
        reason: 'Employees may read their own history',
        version: null,
      }),
    );

    expect(
      resolveScope(await getPermissionGrants(), ROLES.EMPLOYEE, PERMISSIONS.AUDIT_READ),
    ).toBe(SCOPES.SELF);
  });

  it('rejects removing a permission from OFFICE_ADMIN, naming the permission', async () => {
    // FR-1.3. The server is the guarantee; the locked column is only UI.
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: ROLES.OFFICE_ADMIN,
        permission: PERMISSIONS.AUDIT_READ,
        scope: null,
        reason: 'Trying it on',
        version: 1,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/OFFICE_ADMIN must hold audit\.read/);
  });

  it('rejects narrowing OFFICE_ADMIN below ALL', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: ROLES.OFFICE_ADMIN,
        permission: PERMISSIONS.USER_READ,
        scope: SCOPES.TEAM,
        reason: 'Trying it on',
        version: 1,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/cannot be narrowed/i);
  });

  it('leaves the stored grant untouched when validation rejects the change', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    await PATCH(
      json({
        role: ROLES.OFFICE_ADMIN,
        permission: PERMISSIONS.USER_READ,
        scope: null,
        reason: 'Trying it on',
        version: 1,
      }),
    );

    expect(
      resolveScope(await getPermissionGrants(), ROLES.OFFICE_ADMIN, PERMISSIONS.USER_READ),
    ).toBe(SCOPES.ALL);
  });

  it('rejects a fifth role', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const response = await PATCH(
      json({
        role: 'SUPERVISOR',
        permission: PERMISSIONS.USER_READ,
        scope: SCOPES.ALL,
        reason: 'A fifth role',
        version: null,
      }),
    );

    expect(response.status).toBe(400);
  });

  it('answers 409 carrying the current state on a stale cell edit', async () => {
    signedInAs(held(PERMISSIONS.PERMISSION_WRITE));
    await seedOfficeAdmin();

    const body = {
      role: ROLES.IT,
      permission: PERMISSIONS.AUDIT_READ,
      reason: 'Change',
      version: 1,
    };
    await PATCH(json({ ...body, scope: SCOPES.ALL, version: null }));
    await PATCH(json({ ...body, scope: SCOPES.TEAM }));

    const response = await PATCH(json({ ...body, scope: SCOPES.SELF }));
    expect(response.status).toBe(409);
    expect((await response.json()).current).toMatchObject({ scope: SCOPES.TEAM });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run __tests__/api.permissionGrants.test.js
```

Expected: FAIL — cannot resolve `../app/api/permission-grants/route.js`.

- [ ] **Step 3: Add the route rule**

In `authz/routes.js`, beside the other API rules:

```js
  { pattern: /^\/api\/permission-grants$/, permission: PERMISSIONS.PERMISSION_WRITE },
```

- [ ] **Step 4: Write the route**

Create `app/api/permission-grants/route.js`:

```js
import { NextResponse } from 'next/server';
import { validateGrants } from '../../../authz/check.js';
import {
  COMPANY_WIDE,
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import {
  getPermissionGrants,
  listPermissionGrants,
  setPermissionGrant,
} from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * S-19 and P-42. The screen that makes FR-1.2's FGAC half real: a change here
 * takes effect on the next request, with no code change and no redeploy.
 *
 * FR-1.3 is enforced on the *resulting set*, not on the cell. The rule is that
 * OFFICE_ADMIN's grants are a permanent superset, which no single cell can be
 * checked against in isolation — so the proposed change is applied in memory,
 * the whole matrix is validated, and only then is anything written. That is
 * what makes the guarantee independent of what the client sends; the locked
 * column on the screen is a courtesy, not the control.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PERMISSION_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    return NextResponse.json(await listPermissionGrants());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PERMISSION_WRITE);
    assertRecordInScope(scope, actor, COMPANY_WIDE);

    const { version, ...cell } = await request.json();

    const current = await getPermissionGrants();
    const proposed = [
      ...current.filter(
        (grant) =>
          !(grant.role === cell.role && grant.permission === cell.permission),
      ),
      { role: cell.role, permission: cell.permission, scope: cell.scope },
    ];

    const check = validateGrants(proposed);
    if (!check.valid) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    return NextResponse.json(await setPermissionGrant(cell, version, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run __tests__/api.permissionGrants.test.js
```

Expected: PASS, all eight. If "rejects a fifth role" fails with a 500 rather than a 400, `validateGrants` returned invalid but `setPermissionGrant`'s Zod enum threw first — confirm the validation block runs before `setPermissionGrant`.

- [ ] **Step 6: Commit**

```bash
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: permission grant API enforcing FR-1.3 on the resulting set"
```

---

### Task 9: The client half of the contracts

`CLAUDE.md` requires the same contract asserted from both sides. Tasks 4, 6 and 8 asserted the handler fulfils it; this asserts the hook consumes it.

**Files:**
- Create: `hooks/useConfigMutations.js`, `hooks/__tests__/useConfigMutations.test.jsx`

**Interfaces:**
- Consumes: `useMutations` from Task 2.
- Produces: `useConfigMutations()` → `{ pending, error, conflict, dismissConflict, createEmploymentType(data), renameEmploymentType(id, data), softDeleteEmploymentType(id, data), addDomain(data), removeDomain(id, data), setGrant(data) }`. Every mutator resolves `true`/`false`.

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useConfigMutations.test.jsx`:

```jsx
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES, SCOPES } from '../../constants/index.js';
import { useConfigMutations } from '../useConfigMutations.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lastCall = () => global.fetch.mock.calls.at(-1);

describe('useConfigMutations', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  it('posts a new employment type to the collection route', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.createEmploymentType({ name: 'CONTRACT' });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/employment-types');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'CONTRACT' });
  });

  it('patches a rename to the item route, carrying the version', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.renameEmploymentType('abc', { name: 'FIXED_TERM', version: 3 });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/employment-types/abc');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'FIXED_TERM', version: 3 });
  });

  it('posts a soft delete with its reason and version', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.softDeleteEmploymentType('abc', { reason: 'Unused', version: 1 });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/employment-types/abc/soft-delete');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Unused', version: 1 });
  });

  it('posts and removes a domain on the domain routes', async () => {
    const { result } = renderHook(() => useConfigMutations());

    await act(async () => {
      await result.current.addDomain({ domain: 'example.com' });
    });
    expect(lastCall()[0]).toBe('/api/authorised-domains');

    await act(async () => {
      await result.current.removeDomain('xyz', { reason: 'Changed', version: 1 });
    });
    expect(lastCall()[0]).toBe('/api/authorised-domains/xyz/soft-delete');
  });

  it('patches one matrix cell, sending scope, reason and version', async () => {
    const { result } = renderHook(() => useConfigMutations());
    await act(async () => {
      await result.current.setGrant({
        role: ROLES.IT,
        permission: 'audit.read',
        scope: SCOPES.ALL,
        reason: 'IT triages sign-in failures',
        version: null,
      });
    });

    const [url, init] = lastCall();
    expect(url).toBe('/api/permission-grants');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toMatchObject({ role: ROLES.IT, scope: SCOPES.ALL });
  });

  it('reports failure without throwing, so a dialog can stay open', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'A name is required' }),
    });
    const { result } = renderHook(() => useConfigMutations());

    let outcome;
    await act(async () => {
      outcome = await result.current.createEmploymentType({ name: '' });
    });

    expect(outcome).toBe(false);
    expect(result.current.error).toBe('A name is required');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run hooks/__tests__/useConfigMutations.test.jsx
```

Expected: FAIL — cannot resolve `../useConfigMutations.js`.

- [ ] **Step 3: Write the hook**

Create `hooks/useConfigMutations.js`:

```js
'use client';

import { useMutations } from './useMutations.js';

/**
 * The write side of S-18 and S-19.
 *
 * One hook for both screens because they share a single mutation contract and
 * a single conflict surface; splitting it would duplicate the 409 handling for
 * no gain.
 */
export function useConfigMutations() {
  const { post, patch, ...state } = useMutations();

  return {
    ...state,

    // P-40
    createEmploymentType: (data) => post('/api/employment-types', data),
    renameEmploymentType: (id, data) => patch(`/api/employment-types/${id}`, data),
    softDeleteEmploymentType: (id, data) =>
      post(`/api/employment-types/${id}/soft-delete`, data),

    // P-41
    addDomain: (data) => post('/api/authorised-domains', data),
    removeDomain: (id, data) => post(`/api/authorised-domains/${id}/soft-delete`, data),

    // P-42
    setGrant: (data) => patch('/api/permission-grants', data),
  };
}
```

- [ ] **Step 4: Run the tests and commit**

```bash
npx vitest run hooks/__tests__/useConfigMutations.test.jsx
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: the client half of the M-7 mutation contracts"
```

Expected: PASS, all six.

---

### Task 10: `S-18` Company configuration

**Files:**
- Create: `components/CompanySettings.jsx`, `components/EmploymentTypeDialog.jsx`, `components/DomainDialog.jsx`, `components/__tests__/CompanySettings.test.jsx`
- Modify: `app/(app)/settings/page.js`

**Interfaces:**
- Consumes: `useConfigMutations` (Task 9), `PageHeader`, `EmptyState`, `ReasonDialog`.
- Produces: `<CompanySettings employmentTypes={[…]} domains={[…]} canWrite={bool} />`, where each array item is `{ _id: string, name|domain: string, version: number }`.

- [ ] **Step 1: Verify the icons exist before importing them**

```bash
ls node_modules/@mui/icons-material/BadgeOutlined.js \
   node_modules/@mui/icons-material/LanguageOutlined.js \
   node_modules/@mui/icons-material/EditOutlined.js \
   node_modules/@mui/icons-material/DeleteOutlined.js
```

Expected: all four listed. If any is missing, find the real export name with `ls node_modules/@mui/icons-material/ | grep -i <stem>` and use that — never guess.

- [ ] **Step 2: Write the failing test**

Create `components/__tests__/CompanySettings.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompanySettings } from '../CompanySettings.jsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const types = [{ _id: '1', name: 'PERMANENT', version: 1 }];
const domains = [{ _id: '2', domain: 'example.com', version: 1 }];

describe('CompanySettings', () => {
  it('lists both kinds of company-wide configuration', () => {
    render(<CompanySettings employmentTypes={types} domains={domains} canWrite />);

    expect(screen.getByText('PERMANENT')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('states that there is deliberately no company-wide timezone', () => {
    // FR-3.10 and DC-5: its absence looks like an omission rather than a
    // decision unless the screen says so.
    render(<CompanySettings employmentTypes={types} domains={domains} canWrite />);

    expect(screen.getByText(/no company-wide default timezone/i)).toBeInTheDocument();
  });

  it('hides every write control from a viewer without config.write', () => {
    render(
      <CompanySettings employmentTypes={types} domains={domains} canWrite={false} />,
    );

    expect(screen.queryByRole('button', { name: /new employment type/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /authorise a domain/i })).toBeNull();
  });

  it('offers the write controls to a viewer who holds config.write', () => {
    render(<CompanySettings employmentTypes={types} domains={domains} canWrite />);

    expect(screen.getByRole('button', { name: /new employment type/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /authorise a domain/i })).toBeEnabled();
  });

  it('explains an empty domain list rather than showing a blank table', () => {
    render(<CompanySettings employmentTypes={types} domains={[]} canWrite />);

    expect(screen.getByText(/no domain is authorised/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run components/__tests__/CompanySettings.test.jsx
```

Expected: FAIL — cannot resolve `../CompanySettings.jsx`.

- [ ] **Step 4: Write the two dialogs**

`components/EmploymentTypeDialog.jsx` — `P-40`'s create/rename form. Model it exactly on `components/UserFormDialog.jsx`: `'use client'`, a `Dialog maxWidth='sm' fullWidth`, a real `<form onSubmit>` calling `event.preventDefault()`, one `TextField label='Name'` with `autoFocus` and `required`, an error `Alert` above it when `error` is set, `<Button type='button'>Cancel</Button>` and `<Button type='submit' variant='contained' loading={pending}>`. Props: `{ open, onClose, onSubmit, pending, error, initial }` — `initial` is `null` for a create and the type document for a rename, which decides the title (`New employment type` / `Rename employment type`) and the initial field value. Close only when `onSubmit` resolves truthy.

`components/DomainDialog.jsx` — `P-41`. The same shape with one `TextField label='Workspace domain'` whose `helperText` reads `The domain of your Google Workspace, such as example.com — not a full email address. Only accounts on an authorised domain can sign in.`

- [ ] **Step 5: Write `CompanySettings.jsx`**

`'use client'`. Composition, in order:

1. `PageHeader` — title `Company configuration`, description `Settings that are not per team. Everything per-team lives on that team's configuration screen instead.`
2. An `Alert severity='info'` carrying the `FR-3.10` sentence, moved verbatim from the current `app/(app)/settings/page.js`.
3. Two `Paper variant='outlined'` panels, each with a `Typography variant='sectionTitle'` heading, a `size='small'` `Table`, and — when the list is empty — an `EmptyState` in place of the table:
   - **Employment types**: columns Name · Actions. Description line: `No permission depends on employment type.` Empty title `No employment type yet`.
   - **Authorised Google Workspace domains**: columns Domain · Actions. Empty title `No domain is authorised`, description `Sign in is refused for every account until at least one Workspace domain is authorised here.`
4. Write controls only when `canWrite`: a `New employment type` and an `Authorise a domain` button in each panel heading row, plus per-row edit and remove `IconButton`s with `aria-label`s (`Rename PERMANENT`, `Remove example.com`).
5. Both removals route through `ReasonDialog` (`P-46`), never a bespoke confirm — `DESIGN.md`'s reason-gated confirm rule.
6. The `conflict` from `useConfigMutations` renders the `P-47` warning `Alert` with `onClose={dismissConflict}`, copied in shape from `components/UserDetail.jsx`.

Use `Stack spacing={3}` between blocks and `spacing={2}` within one. No custom padding values.

- [ ] **Step 6: Rewrite the page**

Replace `app/(app)/settings/page.js` with a server component that reads the session and both lists and passes serialised props:

```js
import { CompanySettings } from '../../../components/CompanySettings.jsx';
import { PERMISSIONS } from '../../../constants/index.js';
import { listAuthorisedDomains, listEmploymentTypes } from '../../../database.js';
import { getSessionUser } from '../../../session.js';

/**
 * S-18. Server component: it reads the session and the data and hands both
 * down as props. The client leaf reads no session of its own.
 */
export default async function SettingsPage() {
  const [viewer, types, domains] = await Promise.all([
    getSessionUser(),
    listEmploymentTypes(),
    listAuthorisedDomains(),
  ]);

  // ObjectId and Date do not cross the server/client boundary as themselves.
  const serialise = (item) => ({ ...item, _id: String(item._id), deletedAt: null, createdAt: null, updatedAt: null });

  return (
    <CompanySettings
      employmentTypes={types.items.map(serialise)}
      domains={domains.items.map(serialise)}
      canWrite={Boolean(viewer.permissions[PERMISSIONS.CONFIG_WRITE])}
    />
  );
}
```

- [ ] **Step 7: Run the tests and commit**

```bash
npx vitest run components/__tests__/CompanySettings.test.jsx
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: S-18 company configuration"
```

Expected: PASS, all five.

---

### Task 11: `S-19` Access control matrix

**Files:**
- Create: `components/AccessMatrix.jsx`, `components/__tests__/AccessMatrix.test.jsx`
- Modify: `app/(app)/settings/access/page.js`

**Interfaces:**
- Consumes: `useConfigMutations().setGrant`, `ReasonDialog`, `ALL_PERMISSIONS`, `ROLES`, `SCOPES`.
- Produces: `<AccessMatrix grants={[…]} canWrite={bool} />` where each grant is `{ _id: string, role, permission, scope: string|null, version: number }`. A cell with no grant renders as `none`.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/AccessMatrix.test.jsx`:

```jsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS, ROLES, SCOPES } from '../../constants/index.js';
import { AccessMatrix } from '../AccessMatrix.jsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const grants = [
  {
    _id: '1',
    role: ROLES.EMPLOYEE,
    permission: PERMISSIONS.ATTENDANCE_READ,
    scope: SCOPES.ALL,
    version: 1,
  },
];

const cell = (permission, role) =>
  within(screen.getByRole('row', { name: new RegExp(permission) })).getByRole(
    'button',
    { name: new RegExp(`${permission}.*${role}`, 'i') },
  );

describe('AccessMatrix', () => {
  it('renders every permission the system defines, not only the granted ones', () => {
    // FR-1.2: the screen is the catalog. A permission with no row anywhere
    // would be invisible and therefore ungrantable.
    render(<AccessMatrix grants={grants} canWrite />);

    for (const permission of ALL_PERMISSIONS) {
      expect(screen.getByText(permission)).toBeInTheDocument();
    }
  });

  it('shows the scope a role holds, and none where it holds nothing', () => {
    render(<AccessMatrix grants={grants} canWrite />);

    expect(cell(PERMISSIONS.ATTENDANCE_READ, ROLES.EMPLOYEE)).toHaveTextContent('ALL');
    expect(cell(PERMISSIONS.AUDIT_READ, ROLES.EMPLOYEE)).toHaveTextContent('none');
  });

  it('locks every OFFICE_ADMIN cell at ALL', () => {
    // FR-1.3. The server rejects it regardless; this stops the attempt.
    render(<AccessMatrix grants={grants} canWrite />);

    const locked = cell(PERMISSIONS.AUDIT_READ, ROLES.OFFICE_ADMIN);
    expect(locked).toBeDisabled();
    expect(locked).toHaveTextContent('ALL');
  });

  it('disables every cell for a viewer who cannot write', () => {
    render(<AccessMatrix grants={grants} canWrite={false} />);

    expect(cell(PERMISSIONS.ATTENDANCE_READ, ROLES.EMPLOYEE)).toBeDisabled();
  });

  it('states that the four roles are the complete set', () => {
    render(<AccessMatrix grants={grants} canWrite />);
    expect(screen.getByText(/complete set/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run components/__tests__/AccessMatrix.test.jsx
```

Expected: FAIL — cannot resolve `../AccessMatrix.jsx`.

- [ ] **Step 3: Write `AccessMatrix.jsx`**

`'use client'`. Structure:

- `PageHeader` — title `Access control`, description `Every permission the system defines, against every role, with the scope each holds it at. A change here takes effect on the next request, with no redeploy and no restart.`
- The existing `Alert severity='info'` from the stub page, moved verbatim (it already states the locked `OFFICE_ADMIN` column and the complete set of four roles).
- The `P-47` conflict `Alert`, as in `CompanySettings`.
- `Paper variant='outlined'` wrapping a `size='small'` `Table`: header `Permission` then `Object.values(ROLES)`; one row per `ALL_PERMISSIONS` entry, the permission name in `Typography variant='mono'`.
- Each cell is a `Button size='small' variant='outlined'` whose label is the held scope or the word `none`, with `aria-label={`${permission} for ${role}`}` so the test's row/cell lookup works and a screen reader is told which cell it is on. Disabled when `!canWrite` or when the column is `OFFICE_ADMIN`; the `OFFICE_ADMIN` button also carries a `LockOutlined` icon and `title='OFFICE_ADMIN holds every permission at ALL and cannot be narrowed (FR-1.3).'`
- Clicking a cell opens a `ReasonDialog` (`P-42` plus `P-46`) holding one `TextField select label='Scope'` with four options — `SELF`, `TEAM`, `ALL`, and a `none` option whose value is the empty string mapped to `null` on submit. Because that select carries an option for "no scope", set `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}`.
- `onConfirm` calls `setGrant({ role, permission, scope, reason, version: grant?.version ?? null })`.

Build the lookup once per render:

```js
const byCell = new Map(grants.map((g) => [`${g.role}:${g.permission}`, g]));
```

- [ ] **Step 4: Rewrite the page**

Replace `app/(app)/settings/access/page.js` with a server component reading `listPermissionGrants()` and `getSessionUser()`, serialising `_id`, and passing `canWrite={Boolean(viewer.permissions[PERMISSIONS.PERMISSION_WRITE])}`.

- [ ] **Step 5: Run the tests and commit**

```bash
npx vitest run components/__tests__/AccessMatrix.test.jsx
npm run lint:fix && npm run lint
git add -A
git commit -m "feat: S-19 access control matrix"
```

Expected: PASS, all five.

---

### Task 12: Close the branch

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`

- [ ] **Step 1: Update the README feature table**

In `## What is built`, change the two rows that this branch makes untrue and add one:

| Row | New state |
| --- | --- |
| `App shell, all 22 screens routed and gated` | leave as is |
| add: `Company configuration: employment types, authorised domains (S-18)` | `Done` |
| add: `Access control matrix, effective next request (S-19)` | `Done` |

Under `## Things that will bite you`, add:

```markdown
**Removing the last authorised domain is refused.** `FR-1.5` admits a sign-in
only from an authorised domain, so an empty list is a lockout with no way back
in — add the replacement first.

**A withheld permission is a row with a null scope, not a missing row.** Nothing
is destroyed, and the row keeps its version for the next edit.
```

- [ ] **Step 2: Mark §29 built in `ARCHITECTURE.md`**

In `## 29 M-7 · Config and access control`, change the `**Phase:**` line to note it is delivered, and in `## 0.2 What already exists` add `S-18` and `S-19` to the "Built and working" paragraph and remove them from the stub count (21 → 19).

- [ ] **Step 3: Run the full gate**

```bash
npm run lint && npm test && npm run build
```

All three must pass. `npm run build` is the one that catches a server component passing a function to a client component.

- [ ] **Step 4: Run it for real**

```bash
npm run seed && npm run dev
```

Check by hand, signed in as the seeded `OFFICE_ADMIN`:

1. `/settings` lists four employment types and one domain. Add a type, rename it, remove it — the reason field blocks the confirm until typed.
2. Try to remove the only domain: refused, naming the reason.
3. `/settings/access` shows 19 rows × 4 columns. The `OFFICE_ADMIN` column is disabled at `ALL`.
4. Grant `EMPLOYEE` the `audit.read` permission, then reload `/audit` as that role — **MVP criterion 7**: it must work with no restart.
5. Try to narrow an `OFFICE_ADMIN` cell via the API directly; it must answer `400`.

- [ ] **Step 5: Squash-merge**

```bash
git checkout main
git merge --squash phase-4-m7-config-access
git commit
```

Report to the supervisor: what was built, every judgement call taken, and anything found in the existing code that this branch did not fix.

---

## Self-review

**Spec coverage.** `FR-1.2` → Tasks 7, 8, 11. `FR-1.3` → Task 8 (four tests) and Task 11 (locked column). `FR-1.4` → the four-role set is `constants/index.js`, asserted by Task 8's fifth-role test. `FR-1.5` → Tasks 5, 6, 10 (domains). `FR-2.6` employment types → Tasks 3, 4, 10. `FR-6.4` company-wide half → Tasks 3–6, 10. `S-18` → Task 10. `S-19` → Task 11. `P-40` → `EmploymentTypeDialog`. `P-41` → `DomainDialog`. `P-42` → the `AccessMatrix` scope dialog. `P-46` → every soft delete routes through `ReasonDialog`. `P-47` → the conflict `Alert` in both screens. MVP criterion 7 → Task 8's "takes effect on the very next request" and Task 12's manual check.

**Not in this branch, by design.** `FR-3.10`'s "no company-wide timezone" is stated on screen but has nothing to build. Everything in M-6, M-3 and M-9 belongs to branches 2, 3 and 4.

**Type consistency.** `listEmploymentTypes`/`listAuthorisedDomains`/`listPermissionGrants` all return `{ items, total }`. Every mutator takes `(…, version, actor, companyId)` in that order except `createX(input, actor, companyId)`, which has no version to take. `COMPANY_WIDE` is defined in Task 4 and relocated to `authz/guard.js` in Task 6 step 1 before its third consumer exists. `useMutations().post/patch` return booleans, which `EmploymentTypeDialog`, `DomainDialog` and `ReasonDialog` all depend on to decide whether to close.

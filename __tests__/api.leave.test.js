import { format, subDays } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The M-5 contracts (ARCHITECTURE §26.2).
 *
 * S-14 is read only BY DESIGN, and the design is enforced here: the ledger
 * route exports no PATCH, PUT or DELETE, so no screen could offer an edit even
 * if one were written (FR-6.8).
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const balancesRoute = await import('../app/api/leave/balances/route.js');
const ledgerRoute = await import('../app/api/leave/[userId]/ledger/route.js');
const openingRoute = await import('../app/api/leave/opening-balance/route.js');
const entitlementRoute = await import('../app/api/leave/entitlement/route.js');

const {
  createTeam,
  createUser,
  listLedgerEntriesForSource,
  replayBalance,
  updateTeamPolicy,
  upsertPtoCandidate,
} = await import('../database.js');
const { approvePtoAward } = await import('../engine/pto.js');

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

const writer = () =>
  signedInAs(held(PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_WRITE));

const readerOnly = () => signedInAs(held(PERMISSIONS.LEAVE_READ));

const get = (url) => new Request(`http://localhost${url}`);

const post = (url, body) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const params = (userId) => ({ params: Promise.resolve({ userId }) });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('the leave API', () => {
  useTestDatabase();

  const aUser = async (overrides = {}) => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      {
        leaveTypes: [
          { name: 'Annual', annualEntitlement: 10 },
          { name: 'Casual', annualEntitlement: 10 },
        ],
      },
      null,
      actor,
    );

    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `LB-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2020-01-01',
        teamId: String(team._id),
        ...overrides,
      },
      actor,
    );
  };

  describe('GET /api/leave/balances', () => {
    it('returns a balance per user per leave type', async () => {
      const user = await aUser();
      readerOnly();

      const response = await balancesRoute.GET(
        get('/api/leave/balances?from=2026-01-01&to=2026-12-31'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const annual = body.rows.find(
        (row) => row.userId === String(user._id) && row.leaveType === 'Annual',
      );
      expect(annual.balance).toBe(10);
    });

    it('credits the leave year on the way through, since no cron exists (D-12)', async () => {
      const user = await aUser();
      const userId = String(user._id);

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(0);

      readerOnly();
      await balancesRoute.GET(
        get('/api/leave/balances?from=2026-01-01&to=2026-12-31'),
      );

      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);
    });

    it('sweeps an approved PTO award past its expiry on the way through, since no cron exists (D-24)', async () => {
      const user = await aUser();
      const userId = String(user._id);

      // Earned exactly the default 30-day validity ago: the natural expiry
      // is today, so approving it doesn't trigger FR-7.3's late-approval
      // extension — see __tests__/engine.pto.test.js for why this boundary
      // matters.
      const earnedOn = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const candidate = await upsertPtoCandidate(
        userId,
        earnedOn,
        {
          action: 'CREATE',
          patch: { status: 'PENDING', rule: 'BR-19', amount: 1 },
        },
        actor,
      );
      const award = await approvePtoAward(
        String(candidate._id),
        { amount: 1, reason: 'Approved' },
        candidate.version,
        actor,
      );

      readerOnly();
      await balancesRoute.GET(
        get('/api/leave/balances?from=2026-01-01&to=2026-12-31'),
      );

      const entries = await listLedgerEntriesForSource(
        'ptoAward',
        String(award._id),
      );
      expect(entries.some((entry) => entry.entryType === 'PTO_EXPIRY')).toBe(
        true,
      );
    });

    it('requires a range rather than returning everything', async () => {
      readerOnly();

      expect((await balancesRoute.GET(get('/api/leave/balances'))).status).toBe(
        400,
      );
    });

    it('answers 403 without leave.read, naming it', async () => {
      signedInAs(held(PERMISSIONS.USER_READ));

      const response = await balancesRoute.GET(
        get('/api/leave/balances?from=2026-01-01&to=2026-12-31'),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.LEAVE_READ);
    });
  });

  describe('GET /api/leave/[userId]/ledger', () => {
    it('returns every movement with a running balance', async () => {
      const user = await aUser();
      const userId = String(user._id);
      writer();

      await openingRoute.POST(
        post('/api/leave/opening-balance', {
          userId,
          leaveType: 'Annual',
          amount: 2,
          date: '2026-01-01',
          reason: 'From the 2025 workbook',
        }),
      );

      readerOnly();
      const response = await ledgerRoute.GET(
        get(`/api/leave/${userId}/ledger`),
        params(userId),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.entries.length).toBeGreaterThan(0);
      expect(body.entries[0]).toHaveProperty('runningBalance');
    });

    it('offers no way to change anything, because none exists (FR-6.8)', () => {
      expect(ledgerRoute.PATCH).toBeUndefined();
      expect(ledgerRoute.PUT).toBeUndefined();
      expect(ledgerRoute.DELETE).toBeUndefined();
      expect(ledgerRoute.POST).toBeUndefined();
    });

    it('answers 404 for a user who does not exist', async () => {
      readerOnly();

      const response = await ledgerRoute.GET(
        get('/api/leave/64b7f9c2f1a2b3c4d5e6f7a8/ledger'),
        params('64b7f9c2f1a2b3c4d5e6f7a8'),
      );

      expect(response.status).toBe(404);
    });

    it('says a user has no opening entry rather than showing a zero row', async () => {
      const user = await aUser();
      readerOnly();

      const response = await ledgerRoute.GET(
        get(`/api/leave/${user._id}/ledger`),
        params(String(user._id)),
      );

      expect((await response.json()).hasOpeningBalance).toBe(false);
    });
  });

  describe('POST /api/leave/opening-balance', () => {
    it('posts the cutover figure and answers 201', async () => {
      const user = await aUser();
      writer();

      const response = await openingRoute.POST(
        post('/api/leave/opening-balance', {
          userId: String(user._id),
          leaveType: 'Annual',
          amount: 3.5,
          date: '2026-01-01',
          reason: 'Carried from the workbook',
        }),
      );

      expect(response.status).toBe(201);
      expect(
        await replayBalance(String(user._id), 'Annual', '2026-12-31'),
      ).toBe(3.5);
    });

    it('answers 400 without a reason (FR-6.13)', async () => {
      const user = await aUser();
      writer();

      const response = await openingRoute.POST(
        post('/api/leave/opening-balance', {
          userId: String(user._id),
          leaveType: 'Annual',
          amount: 3.5,
          date: '2026-01-01',
        }),
      );

      expect(response.status).toBe(400);
    });

    it('answers 403 without leave.write, naming it', async () => {
      const user = await aUser();
      readerOnly();

      const response = await openingRoute.POST(
        post('/api/leave/opening-balance', {
          userId: String(user._id),
          leaveType: 'Annual',
          amount: 3.5,
          date: '2026-01-01',
          reason: 'From the workbook',
        }),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.LEAVE_WRITE);
    });
  });

  describe('POST /api/leave/entitlement', () => {
    it('overrides the prorated figure, leaving the engine’s credit visible (P-20)', async () => {
      const user = await aUser({ dateOfJoining: '2026-07-01' });
      const userId = String(user._id);
      writer();

      const response = await entitlementRoute.POST(
        post('/api/leave/entitlement', {
          userId,
          leaveType: 'Annual',
          leaveYear: '2026',
          amount: 10,
          reason: 'Offer letter promised the full entitlement',
        }),
      );

      expect(response.status).toBe(200);
      expect(await replayBalance(userId, 'Annual', '2026-12-31')).toBe(10);
    });

    it('answers 400 without a reason', async () => {
      const user = await aUser();
      writer();

      const response = await entitlementRoute.POST(
        post('/api/leave/entitlement', {
          userId: String(user._id),
          leaveType: 'Annual',
          leaveYear: '2026',
          amount: 12,
        }),
      );

      expect(response.status).toBe(400);
    });
  });
});

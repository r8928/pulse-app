import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The CTO half of §26.2's contract table. CTO has no permission of its own —
 * it spends PTO, so it gates on `pto.read`/`pto.approve` exactly as PTO does
 * (§22, `D-23`).
 *
 * The one contract CTO adds over PTO is `BR-26`: an approval with
 * insufficient PTO must be REFUSED at the boundary, naming the shortfall, and
 * must post nothing — and the same call with `override: true` must go
 * through. That is a 400, not a 403: the actor is permitted, the state is not.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const listRoute = await import('../app/api/cto/route.js');
const approveRoute = await import('../app/api/cto/[id]/approve/route.js');
const declineRoute = await import('../app/api/cto/[id]/decline/route.js');
const originateRoute = await import('../app/api/cto/originate/route.js');

const {
  createTeam,
  createUser,
  listLedgerEntriesForSource,
  postLedgerEntries,
  postOpeningBalance,
  replayBalance,
  upsertCtoCandidate,
  upsertDayRecord,
} = await import('../database.js');

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

const approver = () =>
  signedInAs(held(PERMISSIONS.PTO_READ, PERMISSIONS.PTO_APPROVE));

const readerOnly = () => signedInAs(held(PERMISSIONS.PTO_READ));

const get = (url) => new Request(`http://localhost${url}`);

const post = (url, body) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const params = (id) => ({ params: Promise.resolve({ id }) });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('the CTO API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `AC-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
      },
      actor,
    );
  };

  const aCandidate = async (userId, date, rule, amount) =>
    upsertCtoCandidate(
      userId,
      date,
      { action: 'CREATE', patch: { status: 'PENDING', rule, amount } },
      actor,
    );

  /** A day record with the `AUTOMATIC_DEDUCTION` a CTO approval must reverse. */
  const aDay = async (userId, date, deduction) => {
    const { record } = await upsertDayRecord({
      userId,
      date,
      teamId: 'team-1',
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: {
        dayStatus: 'WFO',
        workedMinutes: 300,
        lateMinutes: 200,
        earlyMinutes: 0,
        deduction,
        deductionRule: 'BR-9:profileB:band1',
        isShortDay: true,
      },
      exceptions: [],
    });

    if (deduction > 0) {
      await postLedgerEntries(
        [
          {
            entryType: 'AUTOMATIC_DEDUCTION',
            leaveType: 'Casual',
            amount: -deduction,
            rule: 'BR-9:profileB:band1',
          },
        ],
        {
          sourceType: 'dayRecord',
          sourceId: String(record._id),
          sourceVersion: record.version,
          userId,
          date,
          actor,
          reason: null,
        },
      );
    }

    return record;
  };

  const givePto = async (userId, amount) =>
    postOpeningBalance(
      {
        userId,
        leaveType: 'PTO',
        amount,
        date: '2026-01-01',
        reason: 'Fixture',
      },
      actor,
    );

  describe('GET /api/cto', () => {
    it('shows a PENDING candidate with no ledger entries behind it, and CTO_APPLIED only after approval', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      readerOnly();
      const before = await listRoute.GET(get('/api/cto?status=PENDING'));
      const beforeBody = await before.json();
      const row = beforeBody.items.find((item) => item.userId === userId);
      expect(row.status).toBe('PENDING');
      expect(
        await listLedgerEntriesForSource(
          'ctoApplication',
          String(candidate._id),
        ),
      ).toEqual([]);

      approver();
      await approveRoute.POST(
        post(`/api/cto/${candidate._id}/approve`, {
          amount: 0.5,
          reason: 'Confirmed lateness',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      const entries = await listLedgerEntriesForSource(
        'ctoApplication',
        String(candidate._id),
      );
      expect(entries.some((entry) => entry.entryType === 'CTO_APPLIED')).toBe(
        true,
      );
    });

    it('answers 403 without pto.read, naming it', async () => {
      signedInAs(held(PERMISSIONS.USER_READ));

      const response = await listRoute.GET(get('/api/cto'));

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_READ);
    });
  });

  describe('POST /api/cto/[id]/approve', () => {
    it('applies CTO and cancels that day’s deduction in one call (§22.1)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      approver();
      const response = await approveRoute.POST(
        post(`/api/cto/${candidate._id}/approve`, {
          amount: 0.5,
          reason: 'Confirmed lateness',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('APPROVED');
      expect(body.appliedAmount).toBe(0.5);
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0.5);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);
    });

    it('answers 400 naming the shortfall when PTO is insufficient, and posts nothing (BR-26)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      approver();
      const response = await approveRoute.POST(
        post(`/api/cto/${candidate._id}/approve`, {
          amount: 0.5,
          reason: 'Confirmed lateness',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('0.5');
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-0.5);
    });

    it('goes through with an explicit override, marking blockOverridden', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      approver();
      const response = await approveRoute.POST(
        post(`/api/cto/${candidate._id}/approve`, {
          amount: 0.5,
          reason: 'Approved anyway',
          override: true,
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).blockOverridden).toBe(true);
    });

    it('answers 409 on a stale version, carrying current state', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-23', 0.5);

      approver();
      const response = await approveRoute.POST(
        post(`/api/cto/${candidate._id}/approve`, {
          amount: 0.5,
          reason: 'x',
          version: 99,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).current).toBeTruthy();
    });

    it('answers 403 without pto.approve, naming it', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-23',
        0.5,
      );

      readerOnly();
      const response = await approveRoute.POST(
        post(`/api/cto/${candidate._id}/approve`, {
          amount: 0.5,
          reason: 'x',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_APPROVE);
    });
  });

  describe('POST /api/cto/[id]/decline', () => {
    it('declines and posts nothing', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-22', 0.25);

      approver();
      const response = await declineRoute.POST(
        post(`/api/cto/${candidate._id}/decline`, {
          reason: 'Lateness already excused',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('DECLINED');
      expect(await replayBalance(userId, 'PTO', '2026-12-31')).toBe(0);
    });

    it('answers 400 with no reason', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-22',
        0.25,
      );

      approver();
      const response = await declineRoute.POST(
        post(`/api/cto/${candidate._id}/decline`, {
          reason: '',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/cto/originate', () => {
    it('creates an already-approved application with no prior candidate', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await givePto(userId, 1);
      await aDay(userId, '2026-08-15', 0.5);

      approver();
      const response = await originateRoute.POST(
        post('/api/cto/originate', {
          userId,
          date: '2026-08-15',
          amount: 0.5,
          reason: 'Applied by agreement, system proposed nothing',
        }),
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.status).toBe('APPROVED');
      expect(body.rule).toBe('MANUAL_GRANT');
    });

    it('answers 403 without pto.approve, naming it — reading alone is not enough', async () => {
      const user = await aUser();

      readerOnly();
      const response = await originateRoute.POST(
        post('/api/cto/originate', {
          userId: String(user._id),
          date: '2026-08-15',
          amount: 0.5,
          reason: 'x',
        }),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_APPROVE);
    });
  });
});

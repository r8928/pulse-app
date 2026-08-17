import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The PTO half of §26.2's contract table, split from CTO the same way the
 * table itself does. `GET` needs `pto.read`; every write — including
 * originate — needs `pto.approve` (FR-7.7: a manual grant is an
 * OFFICE_ADMIN action throughout §21–§22).
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const listRoute = await import('../app/api/pto/route.js');
const approveRoute = await import('../app/api/pto/[id]/approve/route.js');
const declineRoute = await import('../app/api/pto/[id]/decline/route.js');
const originateRoute = await import('../app/api/pto/originate/route.js');
const expiryRoute = await import('../app/api/pto/[id]/expiry/route.js');

const {
  createTeam,
  createUser,
  listLedgerEntriesForSource,
  upsertPtoCandidate,
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

describe('the PTO API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `AP-${String(codes++).padStart(3, '0')}`,
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
    upsertPtoCandidate(
      userId,
      date,
      { action: 'CREATE', patch: { status: 'PENDING', rule, amount } },
      actor,
    );

  describe('GET /api/pto', () => {
    it('shows a PENDING candidate with no ledger entries behind it, and PTO_AWARD only after approval', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const candidate = await aCandidate(userId, '2026-08-15', 'BR-19', 1);

      readerOnly();
      const before = await listRoute.GET(get('/api/pto?status=PENDING'));
      const beforeBody = await before.json();
      const row = beforeBody.items.find((item) => item.userId === userId);
      expect(row.status).toBe('PENDING');
      expect(
        await listLedgerEntriesForSource('ptoAward', String(candidate._id)),
      ).toEqual([]);

      approver();
      await approveRoute.POST(
        post(`/api/pto/${candidate._id}/approve`, {
          amount: 1,
          reason: 'Confirmed with the team lead',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      const entries = await listLedgerEntriesForSource(
        'ptoAward',
        String(candidate._id),
      );
      expect(entries.some((entry) => entry.entryType === 'PTO_AWARD')).toBe(
        true,
      );
    });

    it('answers 403 without pto.read, naming it', async () => {
      signedInAs(held(PERMISSIONS.USER_READ));

      const response = await listRoute.GET(get('/api/pto'));

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_READ);
    });
  });

  describe('POST /api/pto/[id]/approve', () => {
    it('approves and returns the updated award', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      approver();
      const response = await approveRoute.POST(
        post(`/api/pto/${candidate._id}/approve`, {
          amount: 1,
          reason: 'Confirmed with the team lead',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('APPROVED');
      expect(body.approvedAmount).toBe(1);
    });

    it('answers 400 with no reason, the house shape', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      approver();
      const response = await approveRoute.POST(
        post(`/api/pto/${candidate._id}/approve`, {
          amount: 1,
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBeTruthy();
    });

    it('answers 409 on a stale version, carrying current state', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      approver();
      const response = await approveRoute.POST(
        post(`/api/pto/${candidate._id}/approve`, {
          amount: 1,
          reason: 'x',
          version: 99,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.current).toBeTruthy();
    });

    it('answers 403 without pto.approve, naming it', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      readerOnly();
      const response = await approveRoute.POST(
        post(`/api/pto/${candidate._id}/approve`, {
          amount: 1,
          reason: 'x',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_APPROVE);
    });
  });

  describe('POST /api/pto/[id]/decline', () => {
    it('declines and posts nothing', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-18',
        0.5,
      );

      approver();
      const response = await declineRoute.POST(
        post(`/api/pto/${candidate._id}/decline`, {
          reason: 'Already compensated separately',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('DECLINED');
      expect(
        await listLedgerEntriesForSource('ptoAward', String(candidate._id)),
      ).toEqual([]);
    });

    it('answers 400 with no reason', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-18',
        0.5,
      );

      approver();
      const response = await declineRoute.POST(
        post(`/api/pto/${candidate._id}/decline`, {
          reason: '',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/pto/originate', () => {
    it('creates an already-approved award with no prior candidate', async () => {
      const user = await aUser();
      const userId = String(user._id);

      approver();
      const response = await originateRoute.POST(
        post('/api/pto/originate', {
          userId,
          date: '2026-08-15',
          amount: 1,
          reason: 'Worked the site outage with no punch record',
        }),
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.status).toBe('APPROVED');
      expect(body.rule).toBe('MANUAL_GRANT');
    });

    it('answers 400, not 500, when the date already has a live candidate', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCandidate(userId, '2026-08-15', 'BR-19', 1);

      approver();
      const response = await originateRoute.POST(
        post('/api/pto/originate', {
          userId,
          date: '2026-08-15',
          amount: 1,
          reason: 'Site outage',
        }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/already exists/i);
    });

    it('answers 403 without pto.approve, naming it — reading alone is not enough', async () => {
      const user = await aUser();

      readerOnly();
      const response = await originateRoute.POST(
        post('/api/pto/originate', {
          userId: String(user._id),
          date: '2026-08-15',
          amount: 1,
          reason: 'x',
        }),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_APPROVE);
    });
  });

  describe('POST /api/pto/[id]/expiry', () => {
    it('overrides the expiry date, audited', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      approver();
      const approved = await (
        await approveRoute.POST(
          post(`/api/pto/${candidate._id}/approve`, {
            amount: 1,
            reason: 'Confirmed',
            version: candidate.version,
          }),
          params(String(candidate._id)),
        )
      ).json();

      const response = await expiryRoute.POST(
        post(`/api/pto/${candidate._id}/expiry`, {
          expiresAt: '2027-06-01',
          reason: 'Extended by agreement',
          version: approved.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).expiresAt).toBe('2027-06-01');
    });

    it('answers 403 without pto.approve, naming it', async () => {
      const user = await aUser();
      const candidate = await aCandidate(
        String(user._id),
        '2026-08-15',
        'BR-19',
        1,
      );

      readerOnly();
      const response = await expiryRoute.POST(
        post(`/api/pto/${candidate._id}/expiry`, {
          expiresAt: '2027-06-01',
          reason: 'x',
          version: candidate.version,
        }),
        params(String(candidate._id)),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.PTO_APPROVE);
    });
  });
});

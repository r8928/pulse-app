import { describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_STATUS,
  PERMISSIONS,
  RECORD_SOURCE,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `FR-2.11` from the boundary.
 *
 * The two things asserted here that nothing else can assert: that the soft
 * delete **succeeds immediately** even when it strands records — access never
 * waits for the approval — and that the approval it raises is reachable,
 * decidable and reversible through the API `S-05` actually calls.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const userSoftDeleteRoute = await import(
  '../app/api/users/[id]/soft-delete/route.js'
);
const tenureSoftDeleteRoute = await import(
  '../app/api/tenures/[id]/soft-delete/route.js'
);
const listRoute = await import('../app/api/approvals/route.js');
const approveRoute = await import('../app/api/approvals/[id]/approve/route.js');
const rejectRoute = await import('../app/api/approvals/[id]/reject/route.js');
const restoreRoute = await import('../app/api/approvals/[id]/restore/route.js');

const {
  createTeam,
  createTenure,
  createUser,
  getDayRecord,
  getUserById,
  listPendingApprovals,
  postLedgerEntries,
  replayBalance,
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

const decider = () =>
  signedInAs(held(PERMISSIONS.EXCEPTIONS_READ, PERMISSIONS.USER_WRITE));

const readerOnly = () => signedInAs(held(PERMISSIONS.EXCEPTIONS_READ));

const get = (url) => new Request(`http://localhost${url}`);

const post = (url, body) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const params = (id) => ({ params: Promise.resolve({ id }) });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('the FR-2.11 reduction API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `AR-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId: String(team._id),
      },
      actor,
    );
  };

  const aCostlyDay = async (userId, date) => {
    const { record } = await upsertDayRecord({
      userId,
      date,
      teamId: 'team-1',
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: {
        dayStatus: 'ABSENT',
        workedMinutes: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        deduction: 1,
        deductionRule: 'BR-10',
        isShortDay: false,
      },
      exceptions: [],
    });

    await postLedgerEntries(
      [
        {
          entryType: 'AUTOMATIC_DEDUCTION',
          leaveType: 'Casual',
          amount: -1,
          rule: 'BR-10',
        },
      ],
      {
        sourceType: RECORD_SOURCE.DAY_RECORD,
        sourceId: String(record._id),
        sourceVersion: record.version,
        userId,
        date,
        actor,
        reason: null,
      },
    );

    return record;
  };

  /** Soft deletes through the route, stranding one day record. */
  const strand = async () => {
    const user = await aUser();
    const userId = String(user._id);
    await aCostlyDay(userId, '2026-08-05');

    decider();
    const response = await userSoftDeleteRoute.POST(
      post(`/api/users/${userId}/soft-delete`, {
        dateOfLeaving: '2026-08-04',
        reason: 'Resigned',
        version: user.version,
      }),
      params(userId),
    );

    const [approval] = await listPendingApprovals();
    return { userId, response, approval };
  };

  describe('POST /api/users/[id]/soft-delete', () => {
    it('completes immediately and raises the approval beside it (FR-2.11)', async () => {
      const { userId, response, approval } = await strand();

      // The departure is done. It never waits for the decision.
      expect(response.status).toBe(200);
      expect((await getUserById(userId)).deletedAt).toBeTruthy();

      expect(approval.records).toHaveLength(1);
      expect(approval.status).toBe(APPROVAL_STATUS.PENDING);
      // And the stranded record is still there, pending the decision.
      expect(await getDayRecord(userId, '2026-08-05')).toBeTruthy();
    });

    it('raises nothing when the departure strands nothing', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-03');

      decider();
      await userSoftDeleteRoute.POST(
        post(`/api/users/${userId}/soft-delete`, {
          dateOfLeaving: '2026-08-04',
          reason: 'Resigned',
          version: user.version,
        }),
        params(userId),
      );

      expect(await listPendingApprovals()).toEqual([]);
    });
  });

  describe('POST /api/tenures/[id]/soft-delete', () => {
    it('raises an approval for the dates the removed tenure covered', async () => {
      const user = await aUser();
      const userId = String(user._id);
      const extra = await createTenure(
        userId,
        {
          startDate: '2025-01-01',
          endDate: '2025-06-30',
          reason: 'Earlier spell with the company',
        },
        actor,
      );
      await aCostlyDay(userId, '2025-03-01');

      decider();
      const response = await tenureSoftDeleteRoute.POST(
        post(`/api/tenures/${extra._id}/soft-delete`, {
          reason: 'Recorded in error',
          version: extra.version,
        }),
        params(String(extra._id)),
      );

      expect(response.status).toBe(200);
      const [approval] = await listPendingApprovals();
      expect(approval.records.map((record) => record.date)).toEqual([
        '2025-03-01',
      ]);
    });
  });

  describe('GET /api/approvals', () => {
    it('lists what is waiting, for a viewer holding exceptions.read', async () => {
      await strand();
      readerOnly();

      const response = await listRoute.GET(get('/api/approvals'));

      expect(response.status).toBe(200);
      expect((await response.json()).items).toHaveLength(1);
    });

    it('answers 403 without exceptions.read, naming it', async () => {
      signedInAs(held(PERMISSIONS.USER_READ));

      const response = await listRoute.GET(get('/api/approvals'));

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.EXCEPTIONS_READ,
      );
    });
  });

  describe('POST /api/approvals/[id]/approve', () => {
    it('soft deletes the records and reverses what they cost', async () => {
      const { userId, approval } = await strand();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);

      decider();
      const response = await approveRoute.POST(
        post(`/api/approvals/${approval._id}/approve`, {
          reason: 'Confirmed with HR',
          version: approval.version,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe(APPROVAL_STATUS.APPROVED);
      expect(await getDayRecord(userId, '2026-08-05')).toBeNull();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);
    });

    it('answers 400 with no reason', async () => {
      const { approval } = await strand();
      decider();

      const response = await approveRoute.POST(
        post(`/api/approvals/${approval._id}/approve`, {
          reason: '',
          version: approval.version,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(400);
    });

    it('answers 409 on a stale version, carrying current state', async () => {
      const { approval } = await strand();
      decider();

      const response = await approveRoute.POST(
        post(`/api/approvals/${approval._id}/approve`, {
          reason: 'x',
          version: 99,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).current).toBeTruthy();
    });

    it('answers 403 without user.write — reading the queue is not deciding it', async () => {
      const { approval } = await strand();
      readerOnly();

      const response = await approveRoute.POST(
        post(`/api/approvals/${approval._id}/approve`, {
          reason: 'x',
          version: approval.version,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.USER_WRITE);
    });

    it('answers 404 for an approval that is not a record', async () => {
      decider();

      const response = await approveRoute.POST(
        post('/api/approvals/not-an-id/approve', { reason: 'x', version: 1 }),
        params('not-an-id'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/approvals/[id]/reject', () => {
    it('moves nothing, so the wrong date can be corrected and resubmitted', async () => {
      const { userId, approval } = await strand();
      decider();

      const response = await rejectRoute.POST(
        post(`/api/approvals/${approval._id}/reject`, {
          reason: 'They left on the 8th, not the 4th',
          version: approval.version,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe(APPROVAL_STATUS.DECLINED);
      expect(await getDayRecord(userId, '2026-08-05')).toBeTruthy();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);
    });
  });

  describe('POST /api/approvals/[id]/restore', () => {
    it('brings the records back and the balance returns exactly', async () => {
      const { userId, approval } = await strand();
      decider();

      const approved = await (
        await approveRoute.POST(
          post(`/api/approvals/${approval._id}/approve`, {
            reason: 'Confirmed',
            version: approval.version,
          }),
          params(String(approval._id)),
        )
      ).json();

      const response = await restoreRoute.POST(
        post(`/api/approvals/${approval._id}/restore`, {
          reason: 'Wrong call',
          version: approved.version,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(200);
      expect(await getDayRecord(userId, '2026-08-05')).toBeTruthy();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);
    });

    it('answers 400 for a reduction that was never approved', async () => {
      const { approval } = await strand();
      decider();

      const response = await restoreRoute.POST(
        post(`/api/approvals/${approval._id}/restore`, {
          reason: 'x',
          version: approval.version,
        }),
        params(String(approval._id)),
      );

      expect(response.status).toBe(400);
    });
  });
});

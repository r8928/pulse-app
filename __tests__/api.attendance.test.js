import { describe, expect, it, vi } from 'vitest';
import {
  PERMISSIONS,
  PUNCH_SOURCE,
  PUNCH_TYPE,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * The S-10 and S-12 read contracts, and P-23 to P-25's override write.
 *
 * §23.1: where an override moves a balance, the movement posts to the ledger
 * in the normal way — so these assert the ledger, not only the record.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const attendanceRoute = await import('../app/api/attendance/route.js');
const dayRoute = await import('../app/api/attendance/[userId]/[date]/route.js');
const overrideRoute = await import(
  '../app/api/attendance/[userId]/[date]/override/route.js'
);

const {
  createPunch,
  createShift,
  createTeam,
  createUser,
  getDayRecord,
  listLedgerEntriesForSource,
  setWeeklyOffPattern,
  updateTeamPolicy,
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

const writer = () =>
  signedInAs(held(PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_WRITE));

const readerOnly = () => signedInAs(held(PERMISSIONS.ATTENDANCE_READ));

const request = (url, body, method = 'GET') =>
  new Request(`http://localhost${url}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

const dayParams = (userId, date) => ({
  params: Promise.resolve({ userId, date }),
});

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('the attendance API', () => {
  useTestDatabase();

  const aTeamWithAUser = async () => {
    const team = await createTeam({ name: `Team ${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      {
        automaticDeductionLeaveType: 'Casual',
        leaveDeductionLadder: [
          {
            latenessFrom: 10,
            latenessTo: 40,
            clockedFrom: 55,
            clockedTo: 80,
            deduction: 0.25,
          },
        ],
        shortDayThresholdPercent: 89,
        midnightCrossingWindowHours: 8,
        duplicatePunchWindowMinutes: 10,
        wfhQuotaDaysPerMonth: 5,
      },
      null,
      actor,
    );
    await setWeeklyOffPattern(
      String(team._id),
      { daysOfWeek: [0, 6] },
      null,
      actor,
    );

    const shift = await createShift(
      {
        teamId: String(team._id),
        name: 'Days',
        startTime: '09:00',
        endTime: '18:00',
        requiredDailyMinutes: 540,
        graceMinutes: 30,
        timezone: 'Asia/Karachi',
      },
      actor,
    );

    const user = await createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `A-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2025-01-01',
        teamId: String(team._id),
        shiftId: String(shift._id),
      },
      actor,
    );

    return { teamId: String(team._id), userId: String(user._id) };
  };

  const aWorkedDay = async (userId) => {
    for (const [type, at] of [
      [PUNCH_TYPE.CHECK_IN, '2026-08-12T04:00:00.000Z'],
      [PUNCH_TYPE.CHECK_OUT, '2026-08-12T13:00:00.000Z'],
    ]) {
      await createPunch({ userId, type, at, source: PUNCH_SOURCE.FORM }, actor);
    }
    const { recalculateDays } = await import('../engine/recalculate.js');
    await recalculateDays(userId, { from: '2026-08-12', to: '2026-08-12' });
  };

  const ledgerFor = async (userId) => {
    const record = await getDayRecord(userId, '2026-08-12');
    return listLedgerEntriesForSource('dayRecord', String(record._id));
  };

  describe('GET /api/attendance', () => {
    it('returns the day records in the range', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      readerOnly();

      const response = await attendanceRoute.GET(
        request('/api/attendance?from=2026-08-01&to=2026-08-31'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total).toBe(1);
      expect(body.items[0].computed.workedMinutes).toBe(540);
    });

    it('requires a range, rather than returning everything', async () => {
      readerOnly();

      const response = await attendanceRoute.GET(request('/api/attendance'));
      expect(response.status).toBe(400);
    });

    it('answers 403 without attendance.read, naming it', async () => {
      signedInAs(held(PERMISSIONS.USER_READ));

      const response = await attendanceRoute.GET(
        request('/api/attendance?from=2026-08-01&to=2026-08-31'),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.ATTENDANCE_READ,
      );
    });

    it('materialises every tracked member of one team on one date (D-15)', async () => {
      const { teamId, userId } = await aTeamWithAUser();
      writer();

      expect(await getDayRecord(userId, '2026-08-13')).toBeNull();

      const response = await attendanceRoute.GET(
        request(
          `/api/attendance?from=2026-08-13&to=2026-08-13&teamId=${teamId}&materialise=true`,
        ),
      );

      expect(response.status).toBe(200);
      const record = await getDayRecord(userId, '2026-08-13');
      expect(record.computed.dayStatus).toBe('ABSENT');
    });

    it('refuses to materialise without attendance.write, since it writes', async () => {
      const { teamId } = await aTeamWithAUser();
      readerOnly();

      const response = await attendanceRoute.GET(
        request(
          `/api/attendance?from=2026-08-13&to=2026-08-13&teamId=${teamId}&materialise=true`,
        ),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/attendance/[userId]/[date]', () => {
    it('returns the record, its punches and its ledger entries together', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      readerOnly();

      const response = await dayRoute.GET(
        request(`/api/attendance/${userId}/2026-08-12`),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.dayRecord.computed.dayStatus).toBe('WFO');
      expect(body.punches).toHaveLength(2);
      expect(body.ledgerEntries).toEqual([]);
      expect(body.leaveRecord).toBeNull();
    });

    it('answers 404 for a date carrying no record, saying why (FR-2.12)', async () => {
      const { userId } = await aTeamWithAUser();
      readerOnly();

      const response = await dayRoute.GET(
        request(`/api/attendance/${userId}/2026-08-13`),
        dayParams(userId, '2026-08-13'),
      );

      expect(response.status).toBe(404);
      expect((await response.json()).error).toMatch(/no day record/i);
    });

    it('answers 404 for a user who does not exist', async () => {
      readerOnly();

      const response = await dayRoute.GET(
        request('/api/attendance/64b7f9c2f1a2b3c4d5e6f7a8/2026-08-12'),
        dayParams('64b7f9c2f1a2b3c4d5e6f7a8', '2026-08-12'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/attendance/[userId]/[date]/override', () => {
    it('sets the override and leaves the engine value beneath it (FR-6.11)', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      const before = await getDayRecord(userId, '2026-08-12');
      writer();

      const response = await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          {
            dayStatus: 'WFH',
            reason: 'Home internet outage',
            version: before.version,
          },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.override.dayStatus).toBe('WFH');
      expect(body.computed.dayStatus).toBe('WFO');
      expect(body.override.actorName).toBe('Office Administrator');
    });

    it('posts the movement the override implies (§23.1, D-13)', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      const before = await getDayRecord(userId, '2026-08-12');
      writer();

      await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { dayStatus: 'WFH', reason: 'Outage', version: before.version },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      const entries = await ledgerFor(userId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entryType: 'WFH_USED',
        leaveType: 'WFH',
        amount: -1,
      });
    });

    it('answers 400 without a reason (FR-9.4)', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      const before = await getDayRecord(userId, '2026-08-12');
      writer();

      const response = await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { dayStatus: 'WFH', version: before.version },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(400);
    });

    it('answers 403 without attendance.write, naming it', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      const before = await getDayRecord(userId, '2026-08-12');
      readerOnly();

      const response = await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { dayStatus: 'WFH', reason: 'Outage', version: before.version },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.ATTENDANCE_WRITE,
      );
    });

    it('answers 409 with the current state on a stale write', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      writer();

      const response = await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { dayStatus: 'WFH', reason: 'Outage', version: 99 },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).current).toBeTruthy();
    });

    it('answers 404 for a date with no record to override', async () => {
      const { userId } = await aTeamWithAUser();
      writer();

      const response = await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-13/override`,
          { dayStatus: 'WFH', reason: 'Outage', version: 1 },
          'PATCH',
        ),
        dayParams(userId, '2026-08-13'),
      );

      expect(response.status).toBe(404);
    });

    it('waives a deduction when the override sets it to zero (P-25, BR-8)', async () => {
      const { userId } = await aTeamWithAUser();
      // Arrive at 11:00 PKT for a 0.25 deduction.
      await createPunch(
        {
          userId,
          type: PUNCH_TYPE.CHECK_IN,
          at: '2026-08-12T06:00:00.000Z',
          source: PUNCH_SOURCE.FORM,
        },
        actor,
      );
      await createPunch(
        {
          userId,
          type: PUNCH_TYPE.CHECK_OUT,
          at: '2026-08-12T12:00:00.000Z',
          source: PUNCH_SOURCE.FORM,
        },
        actor,
      );
      const { recalculateDays } = await import('../engine/recalculate.js');
      await recalculateDays(userId, { from: '2026-08-12', to: '2026-08-12' });

      expect((await ledgerFor(userId)).map((entry) => entry.amount)).toEqual([
        -0.25,
      ]);

      const before = await getDayRecord(userId, '2026-08-12');
      writer();

      await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          {
            deduction: 0,
            reason: 'Waived under BR-8',
            version: before.version,
          },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      const entries = await ledgerFor(userId);
      expect(entries.map((entry) => entry.entryType).sort()).toEqual([
        'AUTOMATIC_DEDUCTION',
        'REVERSAL',
      ]);
      expect(entries.reduce((total, entry) => total + entry.amount, 0)).toBe(0);
    });
  });

  describe('DELETE /api/attendance/[userId]/[date]/override', () => {
    it('clears the override and reverses what it implied', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      const before = await getDayRecord(userId, '2026-08-12');
      writer();

      await overrideRoute.PATCH(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { dayStatus: 'WFH', reason: 'Outage', version: before.version },
          'PATCH',
        ),
        dayParams(userId, '2026-08-12'),
      );

      const overridden = await getDayRecord(userId, '2026-08-12');
      const response = await overrideRoute.DELETE(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { reason: 'Raised in error', version: overridden.version },
          'DELETE',
        ),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).override).toBeNull();

      const entries = await ledgerFor(userId);
      expect(entries.map((entry) => entry.entryType).sort()).toEqual([
        'REVERSAL',
        'WFH_USED',
      ]);
      expect(entries.reduce((total, entry) => total + entry.amount, 0)).toBe(0);
    });

    it('answers 400 without a reason', async () => {
      const { userId } = await aTeamWithAUser();
      await aWorkedDay(userId);
      const record = await getDayRecord(userId, '2026-08-12');
      writer();

      const response = await overrideRoute.DELETE(
        request(
          `/api/attendance/${userId}/2026-08-12/override`,
          { version: record.version },
          'DELETE',
        ),
        dayParams(userId, '2026-08-12'),
      );

      expect(response.status).toBe(400);
    });
  });
});

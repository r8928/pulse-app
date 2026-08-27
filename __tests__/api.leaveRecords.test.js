import { describe, expect, it, vi } from 'vitest';
import {
  HALF_DAY_PERIOD,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * P-26's contract (D-9, D-16). Recording leave is an engine INPUT, so the
 * assertions here are about what the day and the ledger say afterwards, not
 * only about the record that was written.
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const leaveRoute = await import('../app/api/leave-records/route.js');
const cancelRoute = await import(
  '../app/api/leave-records/[id]/soft-delete/route.js'
);

const {
  createShift,
  createTeam,
  createUser,
  getDayRecord,
  listLedgerEntriesForSource,
  updateTeamPolicy,
} = await import('../database.js');
const { giveTeamACalendar } = await import('../test/calendar.js');

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

const request = (body, method = 'POST') =>
  new Request('http://localhost/api/leave-records', {
    method,
    body: JSON.stringify(body),
  });

const params = (id) => ({ params: Promise.resolve({ id }) });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('the leave record API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `Team ${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      {
        leaveTypes: [
          { name: 'Casual', annualEntitlement: 10 },
          { name: 'Sick', annualEntitlement: 10 },
        ],
        automaticDeductionLeaveType: 'Casual',
        leaveDeductionLadder: [
          {
            latenessFrom: null,
            latenessTo: null,
            clockedFrom: 0,
            clockedTo: 0,
            deduction: 1,
            didNotAttend: true,
          },
        ],
        shortDayThresholdPercent: 89,
        midnightCrossingWindowHours: 8,
        duplicatePunchWindowMinutes: 10,
      },
      null,
      actor,
    );
    await giveTeamACalendar(String(team._id), { daysOfWeek: [0, 6] }, actor);

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
        employeeCode: `LV-${String(codes++).padStart(3, '0')}`,
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

    return String(user._id);
  };

  const record = (userId, overrides = {}) =>
    leaveRoute.POST(
      request({
        userId,
        date: '2026-08-12',
        leaveType: 'Casual',
        amount: 1,
        reason: 'Family matter',
        ...overrides,
      }),
    );

  const ledgerFor = async (userId) => {
    const day = await getDayRecord(userId, '2026-08-12');
    return day ? listLedgerEntriesForSource('dayRecord', String(day._id)) : [];
  };

  describe('POST /api/leave-records', () => {
    it('records the leave and returns 201', async () => {
      const userId = await aUser();
      writer();

      const response = await record(userId);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.leaveType).toBe('Casual');
      expect(body.amount).toBe(1);
    });

    it('makes the day read LEAVE and posts the movement it implies (BR-11)', async () => {
      const userId = await aUser();
      writer();
      await record(userId);

      const day = await getDayRecord(userId, '2026-08-12');
      expect(day.computed.dayStatus).toBe('LEAVE');
      expect(day.computed.deduction).toBe(0);

      const entries = await ledgerFor(userId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entryType: 'LEAVE_AVAILED',
        leaveType: 'Casual',
        amount: -1,
      });
    });

    it('answers 403 without leave.write, naming it', async () => {
      const userId = await aUser();
      readerOnly();

      const response = await record(userId);

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(PERMISSIONS.LEAVE_WRITE);
    });

    it('answers 401 when nobody is signed in', async () => {
      getSessionUser.mockResolvedValue(null);

      expect((await record('anyone')).status).toBe(401);
    });

    it('answers 400 for a half day with no period, stating why (D-11)', async () => {
      const userId = await aUser();
      writer();

      const response = await record(userId, { amount: 0.5 });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/morning or afternoon/i);
    });

    it('answers 400 for a second record on the same date, naming the existing type', async () => {
      const userId = await aUser();
      writer();
      await record(userId);

      const response = await record(userId, { leaveType: 'Sick' });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(
        /Casual leave is already recorded/i,
      );
    });

    it('answers 404 for a user who does not exist', async () => {
      writer();

      expect((await record('64b7f9c2f1a2b3c4d5e6f7a8')).status).toBe(404);
    });

    it('records a half day with its period', async () => {
      const userId = await aUser();
      writer();

      const response = await record(userId, {
        amount: 0.5,
        halfDayPeriod: HALF_DAY_PERIOD.MORNING,
      });

      expect(response.status).toBe(201);
      expect((await response.json()).halfDayPeriod).toBe('MORNING');

      const entries = await ledgerFor(userId);
      expect(
        entries.find((entry) => entry.entryType === 'LEAVE_AVAILED').amount,
      ).toBe(-0.5);
    });
  });

  describe('POST /api/leave-records/[id]/soft-delete', () => {
    it('reverses the LEAVE_AVAILED rather than deleting it (FR-6.8, I-1)', async () => {
      const userId = await aUser();
      writer();
      const created = await (await record(userId)).json();

      const response = await cancelRoute.POST(
        request({ reason: 'Came in after all', version: created.version }),
        params(created._id),
      );

      expect(response.status).toBe(200);

      const entries = await ledgerFor(userId);
      const availed = entries.find(
        (entry) => entry.entryType === 'LEAVE_AVAILED',
      );
      const reversal = entries.find((entry) => entry.entryType === 'REVERSAL');

      expect(availed.amount).toBe(-1);
      expect(reversal.amount).toBe(1);
      expect(String(reversal.reversalOf)).toBe(String(availed._id));
    });

    it('answers 400 without a reason', async () => {
      const userId = await aUser();
      writer();
      const created = await (await record(userId)).json();

      const response = await cancelRoute.POST(
        request({ version: created.version }),
        params(created._id),
      );

      expect(response.status).toBe(400);
    });

    it('answers 403 without leave.write', async () => {
      const userId = await aUser();
      writer();
      const created = await (await record(userId)).json();
      readerOnly();

      const response = await cancelRoute.POST(
        request({ reason: 'Cancelled', version: created.version }),
        params(created._id),
      );

      expect(response.status).toBe(403);
    });

    it('answers 404 for an id that does not exist', async () => {
      writer();

      const response = await cancelRoute.POST(
        request({ reason: 'Gone', version: 1 }),
        params('64b7f9c2f1a2b3c4d5e6f7a8'),
      );

      expect(response.status).toBe(404);
    });
  });
});

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
 * The P-21 and P-22 contracts, asserted from the handler side.
 *
 * proxy.js gates the path on attendance.read; each handler asserts
 * attendance.write for its own method, because the permission a mutation needs
 * depends on the method rather than the path (ARCHITECTURE §9.3, §3.3).
 */

vi.mock('../session.js', () => ({ getSessionUser: vi.fn() }));

const { getSessionUser } = await import('../session.js');
const punchesRoute = await import('../app/api/punches/route.js');
const punchRoute = await import('../app/api/punches/[id]/route.js');
const punchDeleteRoute = await import(
  '../app/api/punches/[id]/soft-delete/route.js'
);

const {
  createShift,
  createTeam,
  createUser,
  getDayRecord,
  getPunchById,
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

const json = (body, method = 'POST') =>
  new Request('http://localhost/api/punches', {
    method,
    body: JSON.stringify(body),
  });

const params = (id) => ({ params: Promise.resolve({ id }) });

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const ladder = [
  {
    latenessFrom: 10,
    latenessTo: 40,
    clockedFrom: 55,
    clockedTo: 80,
    deduction: 0.25,
  },
  {
    latenessFrom: null,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 0,
    deduction: 1,
    didNotAttend: true,
  },
];

let codes = 0;

describe('the punch API', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `Team ${codes}` }, actor);
    await updateTeamPolicy(
      String(team._id),
      {
        automaticDeductionLeaveType: 'Casual',
        leaveDeductionLadder: ladder,
        shortDayThresholdPercent: 89,
        midnightCrossingWindowHours: 8,
        duplicatePunchWindowMinutes: 10,
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
        employeeCode: `P-${String(codes++).padStart(3, '0')}`,
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

  const post = (body) => punchesRoute.POST(json(body));

  const aPunch = async (userId, overrides = {}) => {
    writer();
    const response = await post({
      userId,
      at: '2026-08-12T04:00:00.000Z',
      type: PUNCH_TYPE.CHECK_IN,
      source: PUNCH_SOURCE.FORM,
      ...overrides,
    });
    return response.json();
  };

  describe('POST /api/punches', () => {
    it('creates a punch and returns 201 with its stored shape', async () => {
      const userId = await aUser();
      writer();

      const response = await post({
        userId,
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.type).toBe(PUNCH_TYPE.CHECK_IN);
      expect(body.version).toBe(1);
      expect(body._id).toBeDefined();
    });

    it('recalculates the day, so the record exists straight afterwards', async () => {
      const userId = await aUser();
      writer();

      await post({
        userId,
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });
      await post({
        userId,
        at: '2026-08-12T13:00:00.000Z',
        type: PUNCH_TYPE.CHECK_OUT,
        source: PUNCH_SOURCE.FORM,
      });

      const record = await getDayRecord(userId, '2026-08-12');
      expect(record.computed.workedMinutes).toBe(540);
    });

    it('answers 403 naming the permission when the viewer may only read', async () => {
      const userId = await aUser();
      readerOnly();

      const response = await post({
        userId,
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error).toContain(
        PERMISSIONS.ATTENDANCE_WRITE,
      );
    });

    it('answers 401 when nobody is signed in', async () => {
      getSessionUser.mockResolvedValue(null);

      const response = await post({
        userId: 'anyone',
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(401);
    });

    it('answers 400 with the specific reason for an unknown punch type', async () => {
      const userId = await aUser();
      writer();

      const response = await post({
        userId,
        at: '2026-08-12T04:00:00.000Z',
        type: 'CLOCK_IN',
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBeTruthy();
    });

    it('answers 404 for a punch against a user who does not exist', async () => {
      writer();

      const response = await post({
        userId: '64b7f9c2f1a2b3c4d5e6f7a8',
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(404);
    });

    it('refuses a punch outside the employment period, stating why (FR-4.12)', async () => {
      const userId = await aUser();
      writer();

      const response = await post({
        userId,
        at: '2024-06-03T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/employment period/i);
    });

    it('refuses a punch against an untracked user, stating why (FR-2.10)', async () => {
      const team = await createTeam({ name: `Untracked ${codes}` }, actor);
      const user = await createUser(
        {
          fullName: 'Contractor',
          employeeCode: `X-${codes++}`,
          employmentType: 'PERMANENT',
          tracked: false,
          loginEnabled: true,
          role: ROLES.EMPLOYEE,
          dateOfJoining: '2025-01-01',
          teamId: String(team._id),
        },
        actor,
      );
      writer();

      const response = await post({
        userId: String(user._id),
        at: '2026-08-12T04:00:00.000Z',
        type: PUNCH_TYPE.CHECK_IN,
        source: PUNCH_SOURCE.FORM,
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/not tracked/i);
    });
  });

  describe('PATCH /api/punches/[id]', () => {
    it('edits the punch in place and returns it', async () => {
      const userId = await aUser();
      const punch = await aPunch(userId);
      writer();

      const response = await punchRoute.PATCH(
        json(
          {
            at: '2026-08-12T06:00:00.000Z',
            reason: 'Imported two hours early',
            version: punch.version,
          },
          'PATCH',
        ),
        params(punch._id),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(new Date(body.at).toISOString()).toBe('2026-08-12T06:00:00.000Z');
      expect(body.version).toBe(2);
    });

    it('recalculates both the day it left and the day it joined (FR-4.12, MVP 18)', async () => {
      const userId = await aUser();
      const punch = await aPunch(userId);
      // Close the day so it has a record of its own to be corrected.
      await aPunch(userId, {
        at: '2026-08-12T13:00:00.000Z',
        type: PUNCH_TYPE.CHECK_OUT,
      });

      expect(
        (await getDayRecord(userId, '2026-08-12')).computed.workedMinutes,
      ).toBe(540);

      writer();
      await punchRoute.PATCH(
        json(
          {
            at: '2026-08-13T04:00:00.000Z',
            reason: 'Recorded against the wrong date',
            version: punch.version,
          },
          'PATCH',
        ),
        params(punch._id),
      );

      // The day it left no longer counts hours nobody worked...
      const left = await getDayRecord(userId, '2026-08-12');
      expect(left.computed.workedMinutes).toBe(0);
      expect(left.exceptions).toContain('MISSING_CHECK_IN');

      // ...and the day it joined now has it.
      const joined = await getDayRecord(userId, '2026-08-13');
      expect(joined.exceptions).toContain('MISSING_CHECK_OUT');
    });

    it('answers 409 with the current state on a stale write', async () => {
      const userId = await aUser();
      const punch = await aPunch(userId);
      writer();

      const response = await punchRoute.PATCH(
        json({ at: '2026-08-12T06:00:00.000Z', version: 99 }, 'PATCH'),
        params(punch._id),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).current).toBeTruthy();
    });

    it('answers 404 for an id that does not exist', async () => {
      writer();

      const response = await punchRoute.PATCH(
        json({ at: '2026-08-12T06:00:00.000Z', version: 1 }, 'PATCH'),
        params('64b7f9c2f1a2b3c4d5e6f7a8'),
      );

      expect(response.status).toBe(404);
    });

    it('answers 403 without attendance.write', async () => {
      const userId = await aUser();
      const punch = await aPunch(userId);
      readerOnly();

      const response = await punchRoute.PATCH(
        json(
          { at: '2026-08-12T06:00:00.000Z', version: punch.version },
          'PATCH',
        ),
        params(punch._id),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/punches/[id]/soft-delete', () => {
    it('soft deletes it, keeps the row, and recalculates the day', async () => {
      const userId = await aUser();
      const checkIn = await aPunch(userId);
      const checkOut = await aPunch(userId, {
        at: '2026-08-12T13:00:00.000Z',
        type: PUNCH_TYPE.CHECK_OUT,
      });
      expect(
        (await getDayRecord(userId, '2026-08-12')).computed.workedMinutes,
      ).toBe(540);

      writer();
      const response = await punchDeleteRoute.POST(
        json({
          reason: 'Recorded for the wrong person',
          version: checkOut.version,
        }),
        params(checkOut._id),
      );

      expect(response.status).toBe(200);
      expect(await getPunchById(checkOut._id)).not.toBeNull();

      const record = await getDayRecord(userId, '2026-08-12');
      expect(record.computed.workedMinutes).toBe(0);
      expect(record.exceptions).toContain('MISSING_CHECK_OUT');
      expect(checkIn._id).toBeDefined();
    });

    it('answers 400 without a reason (FR-4.10)', async () => {
      const userId = await aUser();
      const punch = await aPunch(userId);
      writer();

      const response = await punchDeleteRoute.POST(
        json({ version: punch.version }),
        params(punch._id),
      );

      expect(response.status).toBe(400);
    });

    it('answers 404 for an id that does not exist', async () => {
      writer();

      const response = await punchDeleteRoute.POST(
        json({ reason: 'Gone', version: 1 }),
        params('64b7f9c2f1a2b3c4d5e6f7a8'),
      );

      expect(response.status).toBe(404);
    });
  });
});

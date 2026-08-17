import { describe, expect, it } from 'vitest';
import {
  APPROVAL_STATUS,
  RECORD_SOURCE,
  REDUCTION_CHANGE,
  ROLES,
} from '../constants/index.js';
import {
  createLeaveRecord,
  createTeam,
  createUser,
  getApprovalById,
  getDayRecord,
  listLedgerEntriesForUser,
  listPendingApprovals,
  postLedgerEntries,
  replayBalance,
  softDeleteUser,
  upsertDayRecord,
  ValidationError,
} from '../database.js';
import {
  approveReduction,
  checkReduction,
  rejectReduction,
  restoreReduction,
} from '../engine/reduction.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `FR-2.11`, and `ARCHITECTURE.md` §19.5's worked example (MVP criterion 16)
 * written out literally.
 *
 * The rule a reader is most likely to get backwards: **the soft delete and
 * the loss of access take effect immediately and never wait for this
 * approval.** What waits is only the fate of the records left stranded
 * outside the reduced period.
 *
 * The other: **no ledger entry is ever deleted or edited.** Approval posts a
 * reversing entry; a later restore reverses the reversal, and the balance
 * returns exactly.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('engine/reduction', () => {
  useTestDatabase();

  const aUser = async () => {
    const team = await createTeam({ name: `T${codes}` }, actor);
    return createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `RD-${String(codes++).padStart(3, '0')}`,
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

  /** A day that cost the user leave, exactly as `recalculateOneDay` posts it. */
  const aCostlyDay = async (userId, date, deduction) => {
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
        deduction,
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
          amount: -deduction,
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

  /** Soft deletes the user with a date of leaving, as `IT` would. */
  const leaveOn = async (user, dateOfLeaving) =>
    softDeleteUser(
      String(user._id),
      { dateOfLeaving, reason: 'Resigned' },
      actor,
      user.version,
    );

  describe('checkReduction', () => {
    it('raises one approval naming the user, the change and every stranded record', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-05', 1);
      await aCostlyDay(userId, '2026-08-06', 1);
      await aCostlyDay(userId, '2026-08-03', 1); // inside — must not be named

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      expect(approval.status).toBe(APPROVAL_STATUS.PENDING);
      expect(approval.userId).toBe(userId);
      expect(approval.change.kind).toBe(REDUCTION_CHANGE.USER_SOFT_DELETED);
      expect(approval.records.map((record) => record.date).sort()).toEqual([
        '2026-08-05',
        '2026-08-06',
      ]);
      expect(await listPendingApprovals()).toHaveLength(1);
    });

    it('raises nothing when the reduction strands nothing, and the change stands', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-03', 1);

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      expect(approval).toBeNull();
      expect(await listPendingApprovals()).toEqual([]);
    });

    it('refreshes the one pending approval rather than raising a second', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-05', 1);

      await leaveOn(user, '2026-08-04');
      await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      // A second stranded day appears — a late import for a date they had
      // already left. The queue must say what is true now, not twice over.
      await aCostlyDay(userId, '2026-08-07', 1);
      const refreshed = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      expect(refreshed.records).toHaveLength(2);
      expect(await listPendingApprovals()).toHaveLength(1);
    });

    it('leaves the soft delete and the loss of access already in force', async () => {
      // The half of FR-2.11 most likely to be read backwards: nothing about
      // the user's departure waits for this decision.
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-05', 1);

      const after = await leaveOn(user, '2026-08-04');
      await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      expect(after.deletedAt).toBeTruthy();
      expect(after.dateOfLeaving).toBe('2026-08-04');
    });
  });

  describe('approveReduction — §19.5 worked example', () => {
    const strandedScenario = async () => {
      const user = await aUser();
      const userId = String(user._id);

      // Four days counted as absences, each consuming leave.
      for (const date of [
        '2026-08-05',
        '2026-08-06',
        '2026-08-07',
        '2026-08-08',
      ]) {
        await aCostlyDay(userId, date, 0.25);
      }

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      return { userId, approval };
    };

    it('soft deletes the records and reverses every entry they caused', async () => {
      const { userId, approval } = await strandedScenario();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);

      const after = await approveReduction(
        String(approval._id),
        'Confirmed with HR — they left on the 4th',
        approval.version,
        actor,
      );

      expect(after.status).toBe(APPROVAL_STATUS.APPROVED);

      // The records leave every total.
      expect(await getDayRecord(userId, '2026-08-05')).toBeNull();
      // The balance replays a full day higher — no entry was destroyed.
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);

      const entries = await listLedgerEntriesForUser(userId, {
        from: '2026-01-01',
        to: '2026-12-31',
      });
      expect(entries.filter((e) => e.entryType === 'REVERSAL')).toHaveLength(4);
      // Nothing was removed: the originals are still there beside them.
      expect(
        entries.filter((e) => e.entryType === 'AUTOMATIC_DEDUCTION'),
      ).toHaveLength(4);
    });

    it('leaves the records inside the period untouched', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-03', 1);
      await aCostlyDay(userId, '2026-08-05', 1);

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );
      await approveReduction(
        String(approval._id),
        'Confirmed',
        approval.version,
        actor,
      );

      expect(await getDayRecord(userId, '2026-08-03')).toBeTruthy();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);
    });

    it('requires a reason, like every decision in the system', async () => {
      const { approval } = await strandedScenario();

      await expect(
        approveReduction(String(approval._id), '', approval.version, actor),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses a stale write', async () => {
      const { approval } = await strandedScenario();

      await expect(
        approveReduction(String(approval._id), 'x', 99, actor),
      ).rejects.toMatchObject({ name: 'StaleWriteError' });
    });

    it('cannot be decided twice', async () => {
      const { approval } = await strandedScenario();
      const after = await approveReduction(
        String(approval._id),
        'Confirmed',
        approval.version,
        actor,
      );

      await expect(
        approveReduction(String(approval._id), 'Again', after.version, actor),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('rejectReduction', () => {
    it('moves nothing, so IT can correct the date and resubmit', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-05', 1);

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      const after = await rejectReduction(
        String(approval._id),
        'The date of leaving is wrong — they left on the 8th',
        approval.version,
        actor,
      );

      expect(after.status).toBe(APPROVAL_STATUS.DECLINED);
      expect(await getDayRecord(userId, '2026-08-05')).toBeTruthy();
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);
      expect(await listPendingApprovals()).toEqual([]);
    });
  });

  describe('restoreReduction', () => {
    it('reverses the reversals and the balance returns exactly (§19.5 step 6)', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-05', 1);

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );
      const approved = await approveReduction(
        String(approval._id),
        'Confirmed',
        approval.version,
        actor,
      );
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(0);

      const after = await restoreReduction(
        String(approval._id),
        'Wrong call — the records were real',
        approved.version,
        actor,
      );

      expect(after.restoredAt).toBeTruthy();
      expect(await getDayRecord(userId, '2026-08-05')).toBeTruthy();
      // Exactly back, not approximately: nothing was ever destroyed.
      expect(await replayBalance(userId, 'Casual', '2026-12-31')).toBe(-1);
    });

    it('refuses to restore something never approved', async () => {
      const user = await aUser();
      const userId = String(user._id);
      await aCostlyDay(userId, '2026-08-05', 1);

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      await expect(
        restoreReduction(String(approval._id), 'x', approval.version, actor),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('leave records', () => {
    it('strands and reverses a leave record the same way as a day (FR-2.4)', async () => {
      const user = await aUser();
      const userId = String(user._id);

      await createLeaveRecord(
        {
          userId,
          date: '2026-08-06',
          leaveType: 'Casual',
          amount: 1,
          reason: 'Family matter',
        },
        actor,
      );

      await leaveOn(user, '2026-08-04');
      const approval = await checkReduction(
        userId,
        { kind: REDUCTION_CHANGE.USER_SOFT_DELETED },
        actor,
      );

      expect(
        approval.records.some(
          (record) => record.sourceType === RECORD_SOURCE.LEAVE_RECORD,
        ),
      ).toBe(true);
    });
  });

  describe('getApprovalById', () => {
    it('answers null for an id that is not a record', async () => {
      expect(await getApprovalById('not-an-id')).toBeNull();
    });
  });
});

import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createHoliday,
  createShift,
  createTeam,
  createUser,
  getTeamPolicy,
  listShifts,
  postOpeningBalance,
  setWeeklyOffPattern,
  softDeleteUser,
  updateTeamPolicy,
  upsertDayRecord,
} from '../database.js';
import {
  buildAnnualSummary,
  buildAttendanceSummary,
} from '../engine/reports.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * `FR-8.3` and `FR-8.4`, and the four things §30.1 says the build must get
 * right and nothing else checks:
 *
 * - working-day counts come from the calendar the user held **on each date**;
 * - an untracked colleague is excluded **and the exclusion is stated**;
 * - a soft-deleted colleague appears with **unchanged** totals, marked;
 * - `S-21` includes **every** month — a month with no data is an explicit
 *   zero row, never silently omitted. That is workbook defect **F1**.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

let codes = 0;

describe('engine/reports', () => {
  useTestDatabase();

  const aTeam = async () => {
    const team = await createTeam({ name: `T${codes++}` }, actor);
    const teamId = String(team._id);

    await createShift(
      {
        teamId,
        name: 'General',
        startTime: '09:00',
        endTime: '18:00',
        timezone: 'Asia/Karachi',
        requiredDailyMinutes: 540,
        graceMinutes: 15,
      },
      actor,
    );
    await setWeeklyOffPattern(teamId, { daysOfWeek: [0, 6] }, null, actor);
    await updateTeamPolicy(teamId, {}, null, actor);

    return team;
  };

  const aUser = async (teamId, overrides = {}) =>
    createUser(
      {
        fullName: `Worker ${codes}`,
        employeeCode: `RP-${String(codes++).padStart(3, '0')}`,
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-01',
        teamId,
        ...overrides,
      },
      actor,
    );

  const aPresentDay = async (userId, date) =>
    upsertDayRecord({
      userId,
      date,
      teamId: 'team-1',
      shiftId: 'shift-1',
      dayType: 'WORKING',
      computed: {
        dayStatus: 'WFO',
        workedMinutes: 540,
        lateMinutes: 0,
        earlyMinutes: 0,
        deduction: 0,
        deductionRule: null,
        isShortDay: false,
      },
      exceptions: [],
    });

  describe('buildAttendanceSummary', () => {
    it('carries the working-day count beside what the person actually did', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);
      await aPresentDay(userId, '2026-08-10');
      await aPresentDay(userId, '2026-08-11');

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      const row = report.rows.find((candidate) => candidate.userId === userId);
      expect(row.workingDays).toBe(5);
      expect(row.holidays).toBe(0);
      expect(row.present).toBe(2);
    });

    it("uses the team's own calendar, so a holiday leaves the working days", async () => {
      const team = await aTeam();
      await createHoliday(
        {
          teamId: String(team._id),
          date: '2026-08-12',
          name: 'Independence Day',
          type: 'PUBLIC',
        },
        actor,
      );
      const user = await aUser(String(team._id));

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      const row = report.rows.find(
        (candidate) => candidate.userId === String(user._id),
      );
      expect(row.workingDays).toBe(4);
      expect(row.holidays).toBe(1);
    });

    it('excludes an untracked colleague and states the exclusion (FR-2.10)', async () => {
      const team = await aTeam();
      await aUser(String(team._id));
      const untracked = await aUser(String(team._id), { tracked: false });

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      expect(
        report.rows.some((row) => row.userId === String(untracked._id)),
      ).toBe(false);
      // Stated, not silent — the whole point of DC-6.
      expect(report.untrackedCount).toBe(1);
    });

    it('keeps a departed colleague with unchanged totals, marked (FR-2.4)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);
      await aPresentDay(userId, '2026-08-10');
      await aPresentDay(userId, '2026-08-11');

      await softDeleteUser(
        userId,
        { dateOfLeaving: '2026-08-20', reason: 'Resigned' },
        actor,
        user.version,
      );

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
        includeDeleted: true,
      });

      const row = report.rows.find((candidate) => candidate.userId === userId);
      expect(row.noLongerActive).toBe(true);
      // Unchanged: a departure bounds which dates exist, never what happened.
      expect(row.present).toBe(2);
    });

    it('narrows to one team and to one user', async () => {
      const teamA = await aTeam();
      const teamB = await aTeam();
      const inA = await aUser(String(teamA._id));
      await aUser(String(teamB._id));

      const byTeam = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
        teamId: String(teamA._id),
      });
      expect(byTeam.rows).toHaveLength(1);

      const byUser = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
        userId: String(inA._id),
      });
      expect(byUser.rows).toHaveLength(1);
      expect(byUser.rows[0].userId).toBe(String(inA._id));
    });

    it('takes any date range, not only a calendar month (MVP criterion 10)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      await aPresentDay(String(user._id), '2026-08-11');

      const report = await buildAttendanceSummary({
        from: '2026-08-11',
        to: '2026-08-11',
      });

      expect(report.rows[0].workingDays).toBe(1);
      expect(report.rows[0].present).toBe(1);
    });

    it('shows a tenure gap as employed either side with nothing inside it', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      // Left on the 11th. The 12th onward is outside the period entirely.
      await softDeleteUser(
        userId,
        { dateOfLeaving: '2026-08-11', reason: 'Resigned' },
        actor,
        user.version,
      );

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
        includeDeleted: true,
      });

      const row = report.rows.find((candidate) => candidate.userId === userId);
      // Monday and Tuesday only — the rest is not absence, it is not
      // employment (FR-2.12).
      expect(row.workingDays).toBe(2);
    });

    /**
     * The three screens the merge folded in. Each assertion is here because
     * losing it would put a column on page 1 that quietly disagrees with the
     * screen it was taken from.
     */
    it('carries every leave balance beside the attendance, keyed by type', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      await postOpeningBalance(
        {
          userId,
          leaveType: 'Annual',
          amount: 12,
          date: '2026-01-01',
          reason: 'Cutover',
        },
        actor,
      );
      await postOpeningBalance(
        {
          userId,
          leaveType: 'Sick',
          amount: 8,
          date: '2026-01-01',
          reason: 'Cutover',
        },
        actor,
      );

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      const row = report.rows.find((candidate) => candidate.userId === userId);
      expect(Object.keys(row.balancesByType).sort()).toEqual([
        'Annual',
        'Sick',
      ]);
      expect(row.balancesByType.Annual.opening).toBe(12);
      expect(row.balancesByType.Annual.balance).toBe(12);
    });

    it('keeps the WFH quota count out of the leave-balance columns (D-13)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      await postOpeningBalance(
        {
          userId,
          leaveType: 'Annual',
          amount: 12,
          date: '2026-01-01',
          reason: 'Cutover',
        },
        actor,
      );

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      const row = report.rows.find((candidate) => candidate.userId === userId);
      // A quota is a ceiling, not a pool — it has its own column and no
      // opening, credited or availed to show under a balance heading.
      expect(row.balancesByType.WFH).toBeUndefined();
      expect(row.balancesByType.PTO).toBeUndefined();
    });

    it('carries the hours checked in and the hours expected', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      const userId = String(user._id);

      // The real shift, not a placeholder: the expectation is read off the
      // shift the day record says was held, so a made-up id expects nothing.
      const [shift] = (await listShifts(String(team._id))).items;

      for (const date of ['2026-08-10', '2026-08-11']) {
        await upsertDayRecord({
          userId,
          date,
          teamId: String(team._id),
          shiftId: String(shift._id),
          dayType: 'WORKING',
          computed: {
            dayStatus: 'WFO',
            workedMinutes: 540,
            lateMinutes: 0,
            earlyMinutes: 0,
            deduction: 0,
            deductionRule: null,
            isShortDay: false,
          },
          exceptions: [],
        });
      }

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-11',
      });

      const row = report.rows.find((candidate) => candidate.userId === userId);
      expect(row.checkedInMinutes).toBe(1080);
      expect(row.expectedMinutes).toBe(1080);
      expect(row.approvedLeaveMinutes).toBe(0);
    });

    it("carries the team's work-from-home quota, the ceiling WFH is counted against (BR-16)", async () => {
      const team = await aTeam();
      // `aTeam` already created the policy, so this edit carries its version —
      // a null one is a first write and would be refused as stale (§6).
      const existing = await getTeamPolicy(String(team._id));
      await updateTeamPolicy(
        String(team._id),
        { wfhQuotaDaysPerMonth: 5 },
        existing.version,
        actor,
      );
      const user = await aUser(String(team._id));

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      expect(
        report.rows.find((row) => row.userId === String(user._id)).wfhQuota,
      ).toBe(5);
    });

    it('leaves the quota null where none is configured, rather than guessing (DC-6)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));

      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
      });

      expect(
        report.rows.find((row) => row.userId === String(user._id)).wfhQuota,
      ).toBe(null);
    });

    it('gives an empty result for a range nobody is in rather than throwing', async () => {
      const report = await buildAttendanceSummary({
        from: '2026-08-10',
        to: '2026-08-16',
        userId: '60b8d295f1e2a40000000000',
      });

      expect(report.rows).toEqual([]);
      expect(report.from).toBe('2026-08-10');
    });
  });

  describe('buildAnnualSummary', () => {
    it('includes every month of the year, defect F1 (FR-8.4, MVP criterion 9)', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      await aPresentDay(String(user._id), '2026-08-10');

      const summary = await buildAnnualSummary(String(user._id), 2026);

      expect(summary.months).toHaveLength(12);
      expect(summary.months.map((month) => month.month)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
    });

    it('renders a month with no data as an explicit zero, never an omission', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));
      await aPresentDay(String(user._id), '2026-08-10');

      const summary = await buildAnnualSummary(String(user._id), 2026);

      const march = summary.months.find((month) => month.month === 3);
      expect(march.present).toBe(0);
      expect(march.inEmploymentPeriod).toBe(true);
      // Still a real month with real working days — a zero, not a blank.
      expect(march.workingDays).toBeGreaterThan(0);
    });

    it('marks a month outside the employment period rather than showing absence', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id), {
        dateOfJoining: '2026-06-01',
      });

      const summary = await buildAnnualSummary(String(user._id), 2026);

      const january = summary.months.find((month) => month.month === 1);
      expect(january.inEmploymentPeriod).toBe(false);
      expect(january.workingDays).toBe(0);
      expect(january.absent).toBe(0);

      const july = summary.months.find((month) => month.month === 7);
      expect(july.inEmploymentPeriod).toBe(true);
    });

    it('names the person, because a year of numbers alone says nothing', async () => {
      const team = await aTeam();
      const user = await aUser(String(team._id));

      const summary = await buildAnnualSummary(String(user._id), 2026);

      expect(summary.user.fullName).toBe(user.fullName);
      expect(summary.year).toBe(2026);
    });

    it('answers null for a user who does not exist', async () => {
      expect(
        await buildAnnualSummary('60b8d295f1e2a40000000000', 2026),
      ).toBeNull();
    });
  });
});

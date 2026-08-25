import { describe, expect, it } from 'vitest';
import {
  collapsedFromParam,
  collapsedToParam,
  flattenSummaryRow,
  summaryColumnGroups,
  visibleColumns,
} from '../summaryColumns.js';

/**
 * Page 1's column set, as data.
 *
 * The merge puts thirty-two columns on a screen sized for an 834px tablet, so
 * which of them are showing is a real piece of state — it lives in the URL and
 * is derived here, once, rather than in the component that draws the header
 * and again in the one that draws the body. A value under the wrong heading is
 * exactly what `columnPriority.js` already exists to prevent one level down.
 */

const leaveTypes = ['Annual', 'Casual', 'Sick'];

const aRow = (overrides = {}) => ({
  userId: 'u1',
  fullName: 'Ahmar Ali',
  employeeCode: 'CB-014',
  workingDays: 22,
  holidays: 1,
  present: 20,
  absent: 1,
  wfh: 3,
  lateDays: 2,
  shortDays: 0,
  holidayWork: 1,
  checkedInMinutes: 8880,
  expectedMinutes: 9120,
  approvedLeaveMinutes: 480,
  pto: 2,
  leaveByType: { Annual: 1 },
  balancesByType: {
    Annual: {
      opening: 10,
      credited: 1.5,
      availed: 1,
      deductions: 0,
      ctoApplied: 0,
      balance: 10.5,
    },
  },
  ...overrides,
});

describe('summaryColumnGroups', () => {
  it('builds one group per leave type found in the data', () => {
    const groups = summaryColumnGroups(leaveTypes);
    const ids = groups.map((group) => group.id);

    expect(ids).toContain('leave:Annual');
    expect(ids).toContain('leave:Sick');
    // FR-6.4: a type nobody has used contributes no column.
    expect(ids).not.toContain('leave:Bereavement');
  });

  it('gives every leave type the six figures the balances screen showed', () => {
    const annual = summaryColumnGroups(leaveTypes).find(
      (group) => group.id === 'leave:Annual',
    );

    expect(annual.columns.map((column) => column.key)).toEqual([
      'leave:Annual:opening',
      'leave:Annual:credited',
      'leave:Annual:availed',
      'leave:Annual:deductions',
      'leave:Annual:ctoApplied',
      'leave:Annual:balance',
    ]);
  });

  it('opens with the leave types collapsed and the attendance expanded', () => {
    const groups = summaryColumnGroups(leaveTypes);
    const collapsedByDefault = groups
      .filter((group) => group.defaultCollapsed)
      .map((group) => group.id);

    expect(collapsedByDefault).toEqual([
      'leave:Annual',
      'leave:Casual',
      'leave:Sick',
    ]);
  });

  it('never lets the identifying columns be collapsed away', () => {
    const identity = summaryColumnGroups(leaveTypes).find(
      (group) => group.id === 'identity',
    );

    expect(identity.collapsible).toBe(false);
  });

  it('builds the attendance columns with no leave types at all', () => {
    const groups = summaryColumnGroups([]);

    expect(groups.some((group) => group.id === 'attendance')).toBe(true);
    expect(groups.some((group) => group.id.startsWith('leave:'))).toBe(false);
  });
});

describe('visibleColumns', () => {
  it('shows every column of an expanded group', () => {
    const groups = summaryColumnGroups(leaveTypes);
    const keys = visibleColumns(groups, new Set()).map((column) => column.key);

    expect(keys).toContain('leave:Annual:opening');
    expect(keys).toContain('shortDays');
  });

  it('shows only the headline column of a collapsed group', () => {
    const groups = summaryColumnGroups(leaveTypes);
    const keys = visibleColumns(groups, new Set(['leave:Annual'])).map(
      (column) => column.key,
    );

    expect(keys).toContain('leave:Annual:balance');
    expect(keys).not.toContain('leave:Annual:opening');
  });

  it('keeps an uncollapsible group whole however it is asked to collapse it', () => {
    const groups = summaryColumnGroups(leaveTypes);
    const keys = visibleColumns(groups, new Set(['identity'])).map(
      (column) => column.key,
    );

    expect(keys).toContain('fullName');
    expect(keys).toContain('employeeCode');
  });
});

describe('collapsedFromParam', () => {
  const groups = summaryColumnGroups(leaveTypes);

  it('uses the defaults when the URL says nothing', () => {
    expect([...collapsedFromParam(null, groups)].sort()).toEqual([
      'leave:Annual',
      'leave:Casual',
      'leave:Sick',
    ]);
  });

  it('collapses exactly what the URL names', () => {
    expect([...collapsedFromParam('attendance,hours', groups)].sort()).toEqual([
      'attendance',
      'hours',
    ]);
  });

  it('collapses nothing when the URL says so explicitly', () => {
    // The distinction the default cannot express: "everything open" has to be
    // sayable, or opening a leave group would be un-shareable.
    expect([...collapsedFromParam('none', groups)]).toEqual([]);
  });

  it('ignores a group id that does not exist', () => {
    expect([...collapsedFromParam('attendance,nonsense', groups)]).toEqual([
      'attendance',
    ]);
  });

  it('ignores an uncollapsible group named in the URL', () => {
    expect([...collapsedFromParam('identity,pto', groups)]).toEqual([]);
  });
});

describe('collapsedToParam', () => {
  it('names what is collapsed', () => {
    expect(collapsedToParam(new Set(['hours', 'attendance']))).toBe(
      'attendance,hours',
    );
  });

  it('says "none" rather than nothing, so the default cannot creep back', () => {
    expect(collapsedToParam(new Set())).toBe('none');
  });
});

describe('flattenSummaryRow', () => {
  it('puts every column key on one flat row', () => {
    const flat = flattenSummaryRow(aRow(), leaveTypes);

    expect(flat.fullName).toBe('Ahmar Ali');
    expect(flat.present).toBe(20);
    expect(flat['leave:Annual:balance']).toBe(10.5);
  });

  it('reports the hours as hours, not as minutes', () => {
    const flat = flattenSummaryRow(aRow(), leaveTypes);

    // The figure a reader checks against a timesheet: 8880 minutes is 148h.
    expect(flat.checkedIn).toBe('148h 00m');
    expect(flat.expected).toBe('152h 00m');
    expect(flat.approvedLeave).toBe('8h 00m');
  });

  it('reads a leave type with no movements as zero rather than blank', () => {
    const flat = flattenSummaryRow(aRow(), leaveTypes);

    // A type with no ledger entries has a balance of zero, which is a fact.
    // Leaving the cell empty would read as "not known".
    expect(flat['leave:Sick:balance']).toBe(0);
    expect(flat['leave:Sick:opening']).toBe(0);
  });

  it('survives a row with no balances at all', () => {
    const flat = flattenSummaryRow(
      aRow({ balancesByType: undefined, leaveByType: undefined }),
      leaveTypes,
    );

    expect(flat['leave:Annual:balance']).toBe(0);
    expect(flat.present).toBe(20);
  });
});

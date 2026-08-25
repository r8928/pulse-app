import { formatDuration } from './duration.js';

/**
 * Page 1's columns, as data.
 *
 * The merge of the attendance overview, the balances screen and the report
 * builder puts thirty-two columns on a page sized for an 834px tablet, so
 * which of them are showing is real state. It is derived here, once, rather
 * than in the component that draws the header and again in the one that draws
 * the body — a value under the wrong heading is the same failure
 * `columnPriority.js` exists to prevent one level down.
 *
 * A group either shows every column it has or shows its one headline column.
 * There is no third state, because a partially-open group has no honest
 * heading to sit under.
 */

const IDENTITY = {
  id: 'identity',
  label: '',
  collapsible: false,
  defaultCollapsed: false,
  columns: [
    { key: 'fullName', label: 'Employee' },
    { key: 'employeeCode', label: 'Code' },
  ],
};

const CALENDAR = {
  id: 'calendar',
  label: 'Calendar',
  collapsible: true,
  defaultCollapsed: false,
  headline: 'workingDays',
  columns: [
    { key: 'workingDays', label: 'Working days', numeric: true },
    { key: 'holidays', label: 'Holidays', numeric: true },
  ],
};

const ATTENDANCE = {
  id: 'attendance',
  label: 'Attendance',
  collapsible: true,
  defaultCollapsed: false,
  headline: 'present',
  columns: [
    { key: 'present', label: 'Present', numeric: true },
    { key: 'absent', label: 'Absent', numeric: true },
    { key: 'wfh', label: 'WFH used', numeric: true },
    { key: 'lateDays', label: 'Late days', numeric: true },
    { key: 'shortDays', label: 'Short days', numeric: true },
    { key: 'holidayWork', label: 'Holiday work', numeric: true },
  ],
};

/**
 * Expected hours already have approved leave netted off, and the leave that
 * was netted off sits beside them. Both are needed: the shortfall is only
 * readable from the first, and only checkable from the second.
 */
const HOURS = {
  id: 'hours',
  label: 'Hours',
  collapsible: true,
  defaultCollapsed: false,
  headline: 'checkedIn',
  columns: [
    { key: 'checkedIn', label: 'Checked in', numeric: true },
    { key: 'expected', label: 'Expected', numeric: true },
    { key: 'approvedLeave', label: 'Approved leave', numeric: true },
  ],
};

const PTO = {
  id: 'pto',
  label: 'PTO',
  collapsible: false,
  defaultCollapsed: false,
  columns: [{ key: 'pto', label: 'PTO', numeric: true }],
};

/** The six figures `S-13` showed per type, in the order it showed them. */
const BALANCE_FIGURES = [
  ['opening', 'Opening'],
  ['credited', 'Credited'],
  ['availed', 'Availed'],
  ['deductions', 'Deductions'],
  ['ctoApplied', 'CTO applied'],
  ['balance', 'Balance'],
];

/**
 * @param {string[]} leaveTypes the types the range actually holds — read off
 *   the data, never off today's policy, because `FR-6.4` makes the list
 *   editable at runtime and a retired type still owes an account of the days
 *   already taken under it.
 */
export function summaryColumnGroups(leaveTypes = []) {
  return [
    IDENTITY,
    CALENDAR,
    ATTENDANCE,
    HOURS,
    PTO,
    ...leaveTypes.map((type) => ({
      id: `leave:${type}`,
      label: type,
      collapsible: true,
      // Collapsed to a balance by default: a reader opening the page wants the
      // attendance, and six figures per type would push it off the screen.
      defaultCollapsed: true,
      headline: `leave:${type}:balance`,
      columns: BALANCE_FIGURES.map(([figure, label]) => ({
        key: `leave:${type}:${figure}`,
        label,
        numeric: true,
      })),
    })),
  ];
}

/** Every column showing, in order, given what is collapsed. */
export function visibleColumns(groups, collapsed) {
  return groups.flatMap((group) => {
    if (!group.collapsible || !collapsed.has(group.id)) return group.columns;
    return group.columns.filter((column) => column.key === group.headline);
  });
}

/**
 * What the URL says is collapsed.
 *
 * An absent parameter means the defaults; the literal `none` means nothing is
 * collapsed. The distinction has to be sayable — without it, opening a leave
 * group could not be shared as a link, because an empty parameter would read
 * as "no preference" and the defaults would close it again.
 */
export function collapsedFromParam(param, groups) {
  const collapsible = new Set(
    groups.filter((group) => group.collapsible).map((group) => group.id),
  );

  if (param === null || param === undefined || param === '') {
    return new Set(
      groups
        .filter((group) => group.collapsible && group.defaultCollapsed)
        .map((group) => group.id),
    );
  }

  if (param === NOTHING_COLLAPSED) return new Set();

  return new Set(
    String(param)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => collapsible.has(id)),
  );
}

const NOTHING_COLLAPSED = 'none';

/** The collapsed set as the query parameter that reproduces it. */
export function collapsedToParam(collapsed) {
  if (collapsed.size === 0) return NOTHING_COLLAPSED;
  return [...collapsed].sort().join(',');
}

/**
 * One row in exactly the shape the columns name — the same object the table
 * reads and the export writes.
 *
 * `P-43` makes the export the report as currently filtered, so it takes the
 * rows the screen is showing rather than re-querying. Producing them from one
 * function is what makes that true rather than aspirational.
 */
export function flattenSummaryRow(row, leaveTypes = []) {
  const balances = row.balancesByType ?? {};

  const flat = {
    userId: row.userId,
    fullName: row.fullName,
    employeeCode: row.employeeCode,
    workingDays: row.workingDays ?? 0,
    holidays: row.holidays ?? 0,
    present: row.present ?? 0,
    absent: row.absent ?? 0,
    wfh: row.wfh ?? 0,
    lateDays: row.lateDays ?? 0,
    shortDays: row.shortDays ?? 0,
    holidayWork: row.holidayWork ?? 0,
    // Hours and minutes, never a decimal: "148.03 hours" is not a figure
    // anyone can check against a timesheet.
    checkedIn: formatDuration(row.checkedInMinutes ?? 0),
    expected: formatDuration(row.expectedMinutes ?? 0),
    approvedLeave: formatDuration(row.approvedLeaveMinutes ?? 0),
    pto: row.pto ?? 0,
  };

  for (const type of leaveTypes) {
    const held = balances[type] ?? {};
    for (const [figure] of BALANCE_FIGURES) {
      // A type with no movements has a balance of zero, which is a fact. An
      // empty cell would read as "not known", which is a different claim.
      flat[`leave:${type}:${figure}`] = held[figure] ?? 0;
    }
  }

  return flat;
}

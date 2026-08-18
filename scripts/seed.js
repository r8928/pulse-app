import {
  ALL_PERMISSIONS,
  EMPLOYMENT_TYPE_SEEDS,
  HOLIDAY_TYPE,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../constants/index.js';
import {
  COLLECTIONS,
  ensureIndexes,
  getPermissionGrants,
  getSeedIdsByKey,
  migrateLegacyTeamKeys,
  upsertSeed,
  upsertSeedUser,
} from '../database.js';

/**
 * Seeds the configuration section 3.10 specifies, plus the administrators
 * who set the rest of it up.
 *
 * Every number here is a seed, not a constant: FR-6.4 makes all of it editable
 * at runtime with no redeploy, and OFFICE_ADMIN changes any of it per team.
 *
 * Idempotent (NFR-15). Running it twice changes nothing.
 *
 * Requires SEED_ADMIN_EMAIL — the work email of the first OFFICE_ADMIN, who
 * must be able to sign in. The authorised Workspace domain is taken from it
 * rather than guessed, because DC-6 forbids defaulting a value like this and a
 * wrong domain locks everyone out.
 */

const adminEmail = process.env.SEED_ADMIN_EMAIL;

if (!adminEmail?.includes('@')) {
  console.error(
    'SEED_ADMIN_EMAIL is not set to a work email address.\n\n' +
      'It is the Google account of the first OFFICE_ADMIN, and its domain\n' +
      'becomes the authorised Workspace domain for sign in. Add it to\n' +
      '.env.local, for example:\n\n' +
      '  SEED_ADMIN_EMAIL=you@yourcompany.com\n',
  );
  process.exit(1);
}

const workspaceDomain = adminEmail.split('@').at(-1).toLowerCase();

/**
 * A public consumer domain is not a Workspace domain. Authorising one leaves
 * the FR-1.5 domain gate excluding almost nobody, so the whole weight of
 * access control falls on the user-record checks behind it.
 *
 * Allowed, because a personal Google account is the agreed starting point
 * before the company GCP project exists — but said out loud, because it is
 * not a state to deploy in.
 */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
]);

const usingConsumerDomain = CONSUMER_DOMAINS.has(workspaceDomain);

/**
 * FR-1.3: OFFICE_ADMIN holds every permission the system defines at ALL, and
 * its set is a permanent superset. Generated from the catalog rather than
 * listed, so a permission added later is granted automatically.
 */
const officeAdminGrants = ALL_PERMISSIONS.map((permission) => ({
  role: ROLES.OFFICE_ADMIN,
  permission,
  scope: SCOPES.ALL,
}));

/** FR-2.1: the user lifecycle only. That is the whole of IT's authority. */
const itGrants = [
  PERMISSIONS.USER_READ,
  PERMISSIONS.USER_WRITE,
  PERMISSIONS.USER_IMPORT,
].map((permission) => ({ role: ROLES.IT, permission, scope: SCOPES.ALL }));

/**
 * FR-6.7: the MANAGER leave-approval permission and its TEAM scope are seeded
 * in Phase 1 and visible on S-19 from day one, even though the request and
 * approval workflow ships in Phase 2.
 */
const managerGrants = [
  { permission: PERMISSIONS.USER_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.ATTENDANCE_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.LEAVE_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.PTO_READ, scope: SCOPES.ALL },
  { permission: PERMISSIONS.LEAVE_APPROVE, scope: SCOPES.TEAM },
].map((grant) => ({ role: ROLES.MANAGER, ...grant }));

/**
 * FR-8.1: EMPLOYEE reads attendance company-wide, as everyone could in the old
 * workbook — expressed as a grant at ALL so it can be narrowed on S-19 with no
 * code change, which is MVP criterion 4.
 *
 * FR-8.2: read only without exception. No write, import, approve, report.build
 * or exceptions.read appears here.
 */
const employeeGrants = [
  PERMISSIONS.USER_READ,
  PERMISSIONS.ATTENDANCE_READ,
  PERMISSIONS.LEAVE_READ,
  PERMISSIONS.PTO_READ,
].map((permission) => ({
  role: ROLES.EMPLOYEE,
  permission,
  scope: SCOPES.ALL,
}));

/**
 * BR-9 seed profile B, as implemented in the old workbook and converted to
 * percentages. Absolute hour bands only made sense for a 9 hour day and broke
 * silently for any other shift length.
 *
 * The last row is flagged `didNotAttend: true` rather than matched by its
 * zero-width clocked band, matching how `ctoApplicationLadder`'s equivalent
 * row already works — `engine/ladders.js`'s `deductionFor` looks for the
 * flag directly (design record D-14).
 */
const leaveDeductionLadder = [
  {
    latenessFrom: 10,
    latenessTo: 40,
    clockedFrom: 55,
    clockedTo: 80,
    deduction: 0.25,
  },
  {
    latenessFrom: 40,
    latenessTo: 55,
    clockedFrom: 33,
    clockedTo: 55,
    deduction: 0.5,
  },
  {
    latenessFrom: 55,
    latenessTo: null,
    clockedFrom: 0,
    clockedTo: 33,
    deduction: 0.75,
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

/** BR-18 to BR-21. The ladder decides what is proposed, never what may be approved. */
const ptoAwardLadder = [
  { rule: 'BR-18', description: 'Half an extra working day', award: 0.5 },
  { rule: 'BR-19', description: 'One full extra working day', award: 1 },
  {
    rule: 'BR-20',
    description: 'A full night worked, then the next working day',
    award: 2,
  },
];

/** BR-22 to BR-25. Applying CTO spends PTO; BR-26 blocks it when there is not enough. */
const ctoApplicationLadder = [
  { rule: 'BR-22', latenessFrom: 22, latenessTo: 44, apply: 0.25 },
  { rule: 'BR-23', latenessFrom: 44, latenessTo: 67, apply: 0.5 },
  { rule: 'BR-24', latenessFrom: 67, latenessTo: null, apply: 0.75 },
  {
    rule: 'BR-25',
    latenessFrom: null,
    latenessTo: null,
    apply: 1,
    didNotAttend: true,
  },
];

const basePolicy = {
  // BR-12: 30 typed days, credited at the start of the leave year.
  leaveTypes: [
    { name: 'Annual', annualEntitlement: 10 },
    { name: 'Sick', annualEntitlement: 10 },
    { name: 'Casual', annualEntitlement: 10 },
    // FR-6.9: separate typed entries that never consume the standard balance.
    { name: 'Paternity', annualEntitlement: 0, consumesStandardBalance: false },
    { name: 'Maternity', annualEntitlement: 0, consumesStandardBalance: false },
  ],
  // BR-13, seeded as the leave year.
  accrualPeriod: 'LEAVE_YEAR',
  carryForward: true,
  // FR-6.3 and BR-26: the single type automatic deductions post to.
  automaticDeductionLeaveType: 'Casual',
  leaveDeductionLadder,
  ptoAwardLadder,
  ptoValidityDays: 30, // FR-7.3
  ctoApplicationLadder,
  wfhQuotaDaysPerMonth: 5, // BR-16
  shortDayThresholdPercent: 89, // BR-5
  holidayWorkThresholdPercent: 22, // BR-27

  /**
   * Deliberately NOT seeded: `midnightCrossingWindowHours` (FR-5.8) and
   * `duplicatePunchWindowMinutes` (FR-4.7).
   *
   * Both are per-team configuration, and spec.md gives no value for either —
   * unlike every figure above, each of which comes from a BR rule. Seeding a
   * guess would dress an invention up as policy, and DC-6 forbids exactly that.
   *
   * OFFICE_ADMIN is prompted for them under FR-3.13, and they stay queued on
   * S-05 until set. Attendance capture cannot resolve a work date for a
   * crossing shift, or flag a duplicate punch, until they are.
   */
};

/**
 * `key` is this script's idempotency key and nothing else. Teams and shifts
 * carry ordinary ObjectId identity, and every child document references that
 * id — a key is never a foreign key, and is null for anything an administrator
 * creates in the application.
 *
 * `defaultShiftKey` is resolved to a real `defaultShiftId` in the second pass
 * below, once the shifts exist and their ids can be read back.
 */
const teams = [
  { key: 'GENERAL', name: 'General', defaultShiftKey: 'DAY_0900' },
  {
    key: 'PRODUCT_OWNERS',
    name: 'Product Owners',
    defaultShiftKey: 'DAY_1000',
  },
  // BR-3: night support.
  { key: 'GC', name: 'GC', defaultShiftKey: 'NIGHT_GC' },
  // BR-4: night shift on the United States Pacific timezone.
  {
    key: 'SALES_MARKETING',
    name: 'Sales and Marketing',
    defaultShiftKey: 'NIGHT_PACIFIC',
  },
];

/*
 * None of those four teams gets a manager here.
 *
 * FR-3.1 requires exactly one, and design record D-5 already left three unset
 * because inventing one dresses a guess up as an org fact (DC-6). The fourth
 * was held by a demo user who has since been purged, so all four are now unset
 * for that same reason, each waiting on a real appointment through S-17 —
 * which flags the FR-3.13 missing-configuration path inline until one is made.
 */

/**
 * FR-3.10 and DC-5: there is no company-wide default timezone. Every shift
 * carries its own, and every timestamp resolves through the shift that applies
 * to that user on that date.
 *
 * BR-4 fixes Sales and Marketing on US Pacific. The spec does not state the
 * local teams' zone, so Asia/Karachi is a seed to confirm at team setup under
 * FR-3.13 — not a value the system inferred.
 */
const shifts = [
  {
    teamKey: 'GENERAL',
    key: 'DAY_0900',
    name: 'Day 09:00 to 18:00',
    startTime: '09:00',
    endTime: '18:00',
    requiredDailyMinutes: 540, // BR-1
    graceMinutes: 30, // BR-7
    timezone: 'Asia/Karachi',
  },
  {
    teamKey: 'PRODUCT_OWNERS',
    key: 'DAY_1000',
    name: 'Day 10:00 to 19:00',
    startTime: '10:00',
    endTime: '19:00',
    requiredDailyMinutes: 540,
    graceMinutes: 30,
    timezone: 'Asia/Karachi',
  },
  {
    teamKey: 'GC',
    key: 'NIGHT_GC',
    name: 'GC night 19:00 to 04:00',
    startTime: '19:00',
    endTime: '04:00',
    requiredDailyMinutes: 540,
    graceMinutes: 30,
    timezone: 'Asia/Karachi',
  },
  {
    teamKey: 'SALES_MARKETING',
    key: 'NIGHT_PACIFIC',
    name: 'Sales and Marketing night, US Pacific',
    startTime: '19:00',
    endTime: '04:00',
    requiredDailyMinutes: 540,
    graceMinutes: 30,
    timezone: 'America/Los_Angeles',
  },
];

/**
 * FR-3.7 and BR-15: each team keeps its own calendar, so two teams observe
 * different holidays on the same date. Seeded differently on purpose — MVP
 * criterion 13 requires two teams to produce different working-day counts.
 */
const holidays = [
  {
    teamKey: 'GENERAL',
    date: '2026-03-23',
    name: 'Public holiday',
    type: HOLIDAY_TYPE.PUBLIC,
  },
  {
    teamKey: 'GENERAL',
    date: '2026-12-25',
    name: 'Company holiday',
    type: HOLIDAY_TYPE.COMPANY,
  },
  {
    teamKey: 'GC',
    date: '2026-03-23',
    name: 'Public holiday',
    type: HOLIDAY_TYPE.PUBLIC,
  },
  {
    teamKey: 'SALES_MARKETING',
    date: '2026-07-04',
    name: 'Public holiday',
    type: HOLIDAY_TYPE.PUBLIC,
  },
  {
    teamKey: 'SALES_MARKETING',
    date: '2026-11-26',
    name: 'Public holiday',
    type: HOLIDAY_TYPE.PUBLIC,
  },
];

/** FR-3.8: not assumed to be Saturday and Sunday. Set per team. */
const weeklyOffPatterns = teams.map((team) => ({
  teamKey: team.key,
  daysOfWeek: team.key === 'SALES_MARKETING' ? [0, 6] : [6, 0],
}));

/**
 * The real administrators, and nobody else.
 *
 * Everyone else on the roster arrives through S-08's import from the company
 * workbook. Inventing colleagues to fill the screens was how this list started
 * and it is not what it is for: a seeded person is indistinguishable from a
 * real one on S-06, and DC-6 forbids dressing a guess up as an org fact.
 */
const seedUsers = [
  {
    fullName: 'Ahmar Ali',
    employeeCode: 'ADM-001',
    workEmail: adminEmail,
    employmentType: EMPLOYMENT_TYPE_SEEDS.PERMANENT,
    role: ROLES.OFFICE_ADMIN,
    teamKey: 'GENERAL',
    tracked: true,
    loginEnabled: true,
    dateOfJoining: '2024-01-01',
  },
  {
    fullName: 'Rashid Hasan',
    employeeCode: 'ADM-002',
    workEmail: 'rashid@radiusxr.com',
    employmentType: EMPLOYMENT_TYPE_SEEDS.PERMANENT,
    role: ROLES.OFFICE_ADMIN,
    teamKey: 'GENERAL',
    tracked: true,
    loginEnabled: true,
    /**
     * Not his real start date, which is not known yet — this is the date the
     * record was created. FR-2.12 makes it editable on S-07 the moment it is,
     * with no re-seed: the tenure is what carries employment history, and the
     * two stored dates follow it.
     */
    dateOfJoining: '2026-08-18',
  },
];

/**
 * FR-1.5's domain gate, derived rather than configured: every domain that a
 * user who may actually sign in holds an address on.
 *
 * Authorising only `SEED_ADMIN_EMAIL`'s domain would seed an account that the
 * gate then refuses — a login that fails for a reason no screen explains.
 */
const authorisedDomains = [
  ...new Set(
    seedUsers
      .filter((user) => user.loginEnabled && user.workEmail)
      .map((user) => user.workEmail.split('@').at(-1).toLowerCase()),
  ),
];

async function seed() {
  /**
   * Teams come first and indexes second, because the unique index on
   * `(companyId, teamId)` cannot build while documents written by an earlier
   * seed still share a null one. Those rows are repaired, never deleted.
   */
  console.warn('Seeding teams...');
  await upsertSeed(
    COLLECTIONS.TEAMS,
    teams.map((team) => ({ key: team.key, name: team.name })),
    ['key'],
  );

  const teamIdByKey = await getSeedIdsByKey(COLLECTIONS.TEAMS);

  const { migrated } = await migrateLegacyTeamKeys(teamIdByKey);
  if (migrated > 0) {
    console.warn(
      `Repaired ${migrated} documents that still carried the old teamKey.`,
    );
  }

  console.warn('Ensuring indexes...');
  await ensureIndexes();

  console.warn(`Authorising sign-in domains: ${authorisedDomains.join(', ')}`);
  await upsertSeed(
    COLLECTIONS.AUTHORISED_DOMAINS,
    authorisedDomains.map((domain) => ({ domain })),
    ['domain'],
  );

  console.warn('Seeding permission grants...');
  await upsertSeed(
    COLLECTIONS.PERMISSION_GRANTS,
    [...officeAdminGrants, ...itGrants, ...managerGrants, ...employeeGrants],
    ['role', 'permission'],
  );

  console.warn('Seeding employment types...');
  await upsertSeed(
    COLLECTIONS.EMPLOYMENT_TYPES,
    Object.values(EMPLOYMENT_TYPE_SEEDS).map((name) => ({ name })),
    ['name'],
  );

  /**
   * Two passes, because teams and shifts carry ObjectId identity and every
   * child document references that id rather than a key string.
   *
   *   1. upsert teams        → read their ids back
   *   2. upsert shifts with a real teamId → read their ids back
   *   3. stamp each team's defaultShiftId, then everything else
   *
   * Without this, `user.teamId` is never set and TEAM-scoped permissions reach
   * no record at all.
   */
  console.warn('Seeding shifts...');
  await upsertSeed(
    COLLECTIONS.SHIFTS,
    shifts.map(({ teamKey, ...shift }) => ({
      ...shift,
      teamId: teamIdByKey[teamKey],
    })),
    ['key'],
  );

  const shiftIdByKey = await getSeedIdsByKey(COLLECTIONS.SHIFTS);

  console.warn('Seeding calendars, patterns and policy...');
  await upsertSeed(
    COLLECTIONS.TEAMS,
    teams.map((team) => ({
      key: team.key,
      name: team.name,
      defaultShiftId: shiftIdByKey[team.defaultShiftKey],
    })),
    ['key'],
  );

  await upsertSeed(
    COLLECTIONS.HOLIDAYS,
    holidays.map(({ teamKey, ...holiday }) => ({
      ...holiday,
      teamId: teamIdByKey[teamKey],
    })),
    ['teamId', 'date'],
  );

  await upsertSeed(
    COLLECTIONS.WEEKLY_OFF_PATTERNS,
    weeklyOffPatterns.map(({ teamKey, ...pattern }) => ({
      ...pattern,
      teamId: teamIdByKey[teamKey],
    })),
    ['teamId'],
  );

  await upsertSeed(
    COLLECTIONS.TEAM_POLICY,
    teams.map((team) => ({ teamId: teamIdByKey[team.key], ...basePolicy })),
    ['teamId'],
  );

  console.warn('Seeding users...');
  for (const { teamKey, ...user } of seedUsers) {
    // FR-3.4: a user with no shift of their own takes their team's default.
    await upsertSeedUser({
      ...user,
      teamId: teamIdByKey[teamKey],
      shiftId:
        shiftIdByKey[
          teams.find((team) => team.key === teamKey).defaultShiftKey
        ],
    });
  }

  const grants = await getPermissionGrants();
  console.warn(
    `\nDone. ${grants.length} permission grants, ${teams.length} teams, ${shifts.length} shifts, ${seedUsers.length} users.`,
  );
  console.warn(`Sign in as ${adminEmail} to reach every screen.`);

  if (usingConsumerDomain) {
    console.warn(
      `\n! ${workspaceDomain} is a public consumer domain, not a Google Workspace one.\n` +
        '  The FR-1.5 domain gate therefore excludes almost nobody, and access\n' +
        '  rests entirely on the user-record checks behind it. Fine for local\n' +
        '  work on a personal GCP project; not a state to deploy in.\n' +
        '  Re-seed with a company address once the company GCP project exists,\n' +
        `  then remove ${workspaceDomain} from the authorisedDomains collection —\n` +
        '  seeding only adds domains, it never removes one.',
    );
  }

  process.exit(0);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

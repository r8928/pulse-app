import { purgeSeedUsers } from '../database.js';

/**
 * Removes seeded users outright, by employee code:
 *
 *   npm run purge-users -- GC-001 SM-001
 *
 * Seeding only upserts, so a demo row invented to exercise a screen has no
 * other way out of the database. This is the counterpart to `seed.js`, and it
 * is deliberately not part of it: seeding is idempotent and safe to re-run,
 * while this is destructive and names its targets one at a time.
 *
 * `softDeleteUser` remains the only way a real person leaves the roster
 * (FR-2.2). A departed colleague keeps their attendance history; a fake one
 * never had any worth keeping.
 */

const codes = process.argv.slice(2);

if (codes.length === 0) {
  console.error(
    'Name at least one employee code to purge.\n\n' +
      '  npm run purge-users -- GC-001 SM-001\n\n' +
      'Every code must match a user, or nothing is deleted.\n',
  );
  process.exit(1);
}

const { removedUsers, removedRecords, teamsCleared } =
  await purgeSeedUsers(codes);

console.warn(
  `Purged ${removedUsers} users and ${removedRecords} of their records.`,
);

if (teamsCleared > 0) {
  console.warn(
    `${teamsCleared} teams lost their manager and now need one appointed on S-17.`,
  );
}

process.exit(0);

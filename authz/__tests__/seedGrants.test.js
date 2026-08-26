import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../../constants/index.js';
import { isAdmin } from '../admin.js';
import { resolveScope } from '../check.js';
import { SEED_GRANTS } from '../seedGrants.js';

/**
 * What each role can do the moment Pulse is seeded.
 *
 * Every row here is a starting point rather than a rule — `S-19` may move any
 * of them — but the starting point is what a company actually runs on, and it
 * had no test at all: the grants used to live inside `scripts/seed.js`, which
 * runs on import and exits without `SEED_ADMIN_EMAIL`, so nothing could read
 * them. A permission silently widening in that file would have been noticed by
 * nobody until somebody saw a screen they should not have.
 */

const scopeFor = (role, permission) =>
  resolveScope(SEED_GRANTS, role, permission);

/** The resolved map `session.js` builds, for the role named. */
const permissionsFor = (role) =>
  Object.fromEntries(
    ALL_PERMISSIONS.map((permission) => [
      permission,
      scopeFor(role, permission),
    ]).filter(([, scope]) => scope),
  );

describe('SEED_GRANTS', () => {
  it('gives OFFICE_ADMIN every permission at ALL (FR-1.3)', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(scopeFor(ROLES.OFFICE_ADMIN, permission)).toBe(SCOPES.ALL);
    }
  });

  it('gives IT the user lifecycle and nothing else (FR-2.1)', () => {
    expect(Object.keys(permissionsFor(ROLES.IT)).sort()).toEqual(
      [
        PERMISSIONS.USER_IMPORT,
        PERMISSIONS.USER_READ,
        PERMISSIONS.USER_WRITE,
      ].sort(),
    );
  });

  it('keeps every colleague reading attendance company-wide (FR-8.1)', () => {
    // The old workbook was open to everyone, and the merge onto one summary
    // screen depends on this staying true.
    for (const role of [ROLES.MANAGER, ROLES.EMPLOYEE]) {
      expect(scopeFor(role, PERMISSIONS.ATTENDANCE_READ)).toBe(SCOPES.ALL);
      expect(scopeFor(role, PERMISSIONS.LEAVE_READ)).toBe(SCOPES.ALL);
    }
  });

  it('gives EMPLOYEE no write, import, approve, report or exception permission (FR-8.2)', () => {
    const held = Object.keys(permissionsFor(ROLES.EMPLOYEE));

    for (const permission of held) {
      expect(permission).toMatch(/\.read$/);
    }
  });
});

describe('SEED_GRANTS — who administers Pulse', () => {
  it('lets a colleague read their own record and nobody else’s', () => {
    // SELF rather than withholding the grant: `proxy.js` still sends them to
    // their own profile, which is where their phone number is.
    expect(scopeFor(ROLES.EMPLOYEE, PERMISSIONS.USER_READ)).toBe(SCOPES.SELF);
    expect(scopeFor(ROLES.MANAGER, PERMISSIONS.USER_READ)).toBe(SCOPES.SELF);
  });

  it('makes exactly OFFICE_ADMIN and IT administrators', () => {
    expect(isAdmin(permissionsFor(ROLES.OFFICE_ADMIN))).toBe(true);
    expect(isAdmin(permissionsFor(ROLES.IT))).toBe(true);
    expect(isAdmin(permissionsFor(ROLES.MANAGER))).toBe(false);
    expect(isAdmin(permissionsFor(ROLES.EMPLOYEE))).toBe(false);
  });
});

describe('SEED_GRANTS — who may punch', () => {
  /**
   * The punch form on `S-12` is gated on `attendance.write`, which the
   * handler asserts as well as the screen. This is the third leg: that no
   * role but the all-permission one is handed it to begin with.
   */
  it('gives attendance.write to no role but OFFICE_ADMIN', () => {
    for (const role of [ROLES.IT, ROLES.MANAGER, ROLES.EMPLOYEE]) {
      expect(scopeFor(role, PERMISSIONS.ATTENDANCE_WRITE)).toBe(null);
    }

    expect(scopeFor(ROLES.OFFICE_ADMIN, PERMISSIONS.ATTENDANCE_WRITE)).toBe(
      SCOPES.ALL,
    );
  });

  it('gives the punch import to no role but OFFICE_ADMIN either', () => {
    for (const role of [ROLES.IT, ROLES.MANAGER, ROLES.EMPLOYEE]) {
      expect(scopeFor(role, PERMISSIONS.ATTENDANCE_IMPORT)).toBe(null);
    }
  });
});

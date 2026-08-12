import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, SCOPES } from '../../constants/index.js';
import { recordInScope, resolveScope, validateGrants } from '../check.js';

/**
 * FR-1.2 requires two checks: the endpoint check (does this role hold the
 * permission at all) and the record check (does the scope reach this record).
 * Neither alone is sufficient, so both are tested independently here.
 */

const grant = (role, permission, scope) => ({ role, permission, scope });

// --- resolveScope: the endpoint check --------------------------------------

describe('resolveScope', () => {
  it('returns the scope a role holds a permission at', () => {
    const grants = [
      grant(ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_READ, SCOPES.ALL),
    ];

    expect(
      resolveScope(grants, ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_READ),
    ).toBe(SCOPES.ALL);
  });

  it('returns null when the role holds no grant for that permission', () => {
    const grants = [
      grant(ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_READ, SCOPES.ALL),
    ];

    expect(
      resolveScope(grants, ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_WRITE),
    ).toBeNull();
  });

  it('reflects a narrowed scope, so an S-19 edit lands on the next request', () => {
    const grants = [
      grant(ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_READ, SCOPES.SELF),
    ];

    expect(
      resolveScope(grants, ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_READ),
    ).toBe(SCOPES.SELF);
  });

  it('gives OFFICE_ADMIN ALL for a permission no grant row mentions', () => {
    // FR-1.3: every permission the system defines, now or later, is granted to
    // OFFICE_ADMIN at ALL by default. A newly added permission must not lock
    // the one all-permission role out of its own screen.
    expect(
      resolveScope([], ROLES.OFFICE_ADMIN, PERMISSIONS.PERMISSION_WRITE),
    ).toBe(SCOPES.ALL);
  });

  it('gives OFFICE_ADMIN ALL even when a grant row tries to narrow it', () => {
    const grants = [
      grant(ROLES.OFFICE_ADMIN, PERMISSIONS.USER_READ, SCOPES.SELF),
    ];

    expect(
      resolveScope(grants, ROLES.OFFICE_ADMIN, PERMISSIONS.USER_READ),
    ).toBe(SCOPES.ALL);
  });

  it('returns null for an unknown role rather than defaulting to a scope', () => {
    expect(resolveScope([], 'AUDITOR', PERMISSIONS.USER_READ)).toBeNull();
  });
});

// --- recordInScope: the record check ---------------------------------------

describe('recordInScope', () => {
  const actor = { userId: 'u1', teamId: 't1' };

  it('reaches any record at ALL scope', () => {
    expect(
      recordInScope(SCOPES.ALL, actor, { userId: 'u9', teamId: 't9' }),
    ).toBe(true);
  });

  it('reaches a record on the actor own team at TEAM scope', () => {
    expect(
      recordInScope(SCOPES.TEAM, actor, { userId: 'u9', teamId: 't1' }),
    ).toBe(true);
  });

  it('refuses a record on another team at TEAM scope', () => {
    expect(
      recordInScope(SCOPES.TEAM, actor, { userId: 'u9', teamId: 't9' }),
    ).toBe(false);
  });

  it('reaches only the actor own record at SELF scope', () => {
    expect(
      recordInScope(SCOPES.SELF, actor, { userId: 'u1', teamId: 't1' }),
    ).toBe(true);
  });

  it('refuses a colleague record at SELF scope, even on the same team', () => {
    expect(
      recordInScope(SCOPES.SELF, actor, { userId: 'u9', teamId: 't1' }),
    ).toBe(false);
  });

  it('refuses everything when no scope was resolved', () => {
    expect(recordInScope(null, actor, { userId: 'u1', teamId: 't1' })).toBe(
      false,
    );
  });

  it('refuses a TEAM check when the actor has no team, rather than matching undefined', () => {
    expect(recordInScope(SCOPES.TEAM, { userId: 'u1' }, { userId: 'u9' })).toBe(
      false,
    );
  });
});

// --- validateGrants: the FR-1.3 invariant ----------------------------------

describe('validateGrants', () => {
  const fullAdminGrants = () =>
    Object.values(PERMISSIONS).map((permission) =>
      grant(ROLES.OFFICE_ADMIN, permission, SCOPES.ALL),
    );

  it('accepts a grant set where OFFICE_ADMIN holds everything at ALL', () => {
    expect(validateGrants(fullAdminGrants()).valid).toBe(true);
  });

  it('rejects narrowing an OFFICE_ADMIN grant below ALL', () => {
    const grants = fullAdminGrants();
    grants[0] = grant(ROLES.OFFICE_ADMIN, grants[0].permission, SCOPES.TEAM);

    const result = validateGrants(grants);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain(grants[0].permission);
  });

  it('rejects removing a permission from OFFICE_ADMIN', () => {
    const grants = fullAdminGrants().slice(1);

    const result = validateGrants(grants);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain(PERMISSIONS.USER_READ);
  });

  it('accepts narrowing another role, which is the whole point of S-19', () => {
    const grants = [
      ...fullAdminGrants(),
      grant(ROLES.EMPLOYEE, PERMISSIONS.ATTENDANCE_READ, SCOPES.SELF),
    ];

    expect(validateGrants(grants).valid).toBe(true);
  });

  it('rejects a grant naming a permission outside the catalog', () => {
    const grants = [
      ...fullAdminGrants(),
      grant(ROLES.EMPLOYEE, 'payroll.read', SCOPES.ALL),
    ];

    const result = validateGrants(grants);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('payroll.read');
  });

  it('rejects a grant naming a role outside the four seeded ones', () => {
    const grants = [
      ...fullAdminGrants(),
      grant('AUDITOR', PERMISSIONS.AUDIT_READ, SCOPES.ALL),
    ];

    const result = validateGrants(grants);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('AUDITOR');
  });
});

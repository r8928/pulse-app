import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../constants/index.js';
import { isPublicPath, requiredPermissionFor } from '../routes.js';

/**
 * The endpoint half of FR-1.2, expressed as data. proxy.js asks this which
 * permission a path needs, then asks check.js whether the viewer holds it.
 *
 * Specificity matters: /users/import is not a user id, and /settings/access is
 * not the settings page. A greedy match would hand the roster-import screen to
 * anyone holding user.read.
 */

describe('isPublicPath', () => {
  it('treats the sign-in screen as public, since it is the only unauthenticated one', () => {
    expect(isPublicPath('/signin')).toBe(true);
  });

  it('treats the auth callback as public, or sign-in could never complete', () => {
    expect(isPublicPath('/api/auth/callback/google')).toBe(true);
  });

  it('does not treat the home page as public', () => {
    expect(isPublicPath('/')).toBe(false);
  });

  it('does not treat a nested route as public because of a prefix', () => {
    expect(isPublicPath('/signinsomething')).toBe(false);
  });
});

describe('requiredPermissionFor', () => {
  it('requires no permission for home, which every signed-in user reaches', () => {
    expect(requiredPermissionFor('/')).toBeNull();
  });

  it('requires no permission for the access-denied screen', () => {
    expect(requiredPermissionFor('/403')).toBeNull();
  });

  it('gates the exceptions dashboard, withheld from EMPLOYEE', () => {
    expect(requiredPermissionFor('/exceptions')).toBe(
      PERMISSIONS.EXCEPTIONS_READ,
    );
  });

  it('gates the roster on user read', () => {
    expect(requiredPermissionFor('/users')).toBe(PERMISSIONS.USER_READ);
  });

  it('gates a user detail page on user read', () => {
    expect(requiredPermissionFor('/users/507f1f77bcf86cd799439011')).toBe(
      PERMISSIONS.USER_READ,
    );
  });

  it('gates roster import on its own permission, not on user read', () => {
    // The static segment must win over the dynamic one, or anyone holding
    // user.read reaches the import screen.
    expect(requiredPermissionFor('/users/import')).toBe(
      PERMISSIONS.USER_IMPORT,
    );
  });

  it('maps the blank roster template, which is otherwise served as a 404', () => {
    // An unmapped path is not public: `proxy.js` answers 404 for it. A route
    // that exists and is unreachable fails only in the browser, never in a
    // handler test, so the mapping is asserted here.
    expect(requiredPermissionFor('/api/users/import/template')).toBe(
      PERMISSIONS.USER_IMPORT,
    );
  });

  it('gates the attendance overview on attendance read', () => {
    expect(requiredPermissionFor('/attendance')).toBe(
      PERMISSIONS.ATTENDANCE_READ,
    );
  });

  it('gates attendance import on its own permission', () => {
    expect(requiredPermissionFor('/attendance/import')).toBe(
      PERMISSIONS.ATTENDANCE_IMPORT,
    );
  });

  it('gates a day record detail on attendance read', () => {
    expect(requiredPermissionFor('/attendance/abc123/2026-08-12')).toBe(
      PERMISSIONS.ATTENDANCE_READ,
    );
  });

  it('gates leave balances on leave read', () => {
    expect(requiredPermissionFor('/leave')).toBe(PERMISSIONS.LEAVE_READ);
  });

  it('gates the ledger trace on leave read', () => {
    expect(requiredPermissionFor('/leave/abc123/ledger')).toBe(
      PERMISSIONS.LEAVE_READ,
    );
  });

  it('gates PTO on pto read', () => {
    expect(requiredPermissionFor('/pto')).toBe(PERMISSIONS.PTO_READ);
  });

  it('gates the CTO API on pto read, because CTO spends PTO', () => {
    // §22, D-23: CTO has no permission of its own. Inventing a cto.read here
    // would create a permission nothing seeds and no role holds.
    expect(requiredPermissionFor('/api/cto')).toBe(PERMISSIONS.PTO_READ);
    expect(requiredPermissionFor('/api/cto/abc123/approve')).toBe(
      PERMISSIONS.PTO_READ,
    );
  });

  it('does not let the award-id pattern swallow originate', () => {
    // `/api/pto/originate` is a manual grant, not an award id. Both map to
    // pto.read at the path and assert pto.approve in the handler, so a greedy
    // match is not a hole today — but it would become one the moment the two
    // diverge, and the rule order is what keeps that honest.
    expect(requiredPermissionFor('/api/pto/originate')).toBe(
      PERMISSIONS.PTO_READ,
    );
    expect(requiredPermissionFor('/api/pto/abc123/expiry')).toBe(
      PERMISSIONS.PTO_READ,
    );
  });

  it('gates team configuration on team read', () => {
    expect(requiredPermissionFor('/teams/abc123')).toBe(PERMISSIONS.TEAM_READ);
  });

  it('gates company settings on config read', () => {
    expect(requiredPermissionFor('/settings')).toBe(PERMISSIONS.CONFIG_READ);
  });

  it('gates the access control matrix on permission write, not config read', () => {
    // S-19 changes who can do what. Reading company settings must not reach it.
    expect(requiredPermissionFor('/settings/access')).toBe(
      PERMISSIONS.PERMISSION_WRITE,
    );
  });

  it('gates the annual summary on attendance read, which EMPLOYEE does hold', () => {
    // FR-8.1: one colleague's year is readable for any colleague, exactly as
    // everyone could read everyone's in the workbook this replaces.
    expect(requiredPermissionFor('/attendance/annual')).toBe(
      PERMISSIONS.ATTENDANCE_READ,
    );
  });

  it('still gates the export API on report build, which EMPLOYEE does not hold', () => {
    // The report builder's SCREEN is gone — its columns are part of the
    // attendance summary now, where the rows are already narrowed to the
    // viewer's scope. Producing a file of them is still restricted (FR-8.1).
    expect(requiredPermissionFor('/api/reports/export')).toBe(
      PERMISSIONS.REPORT_BUILD,
    );
  });

  it('leaves the retired routes open, because they only redirect', () => {
    // There is no screen at either any more, only a forward to one that gates
    // properly. Gating the doorway too would answer 403 to somebody following
    // an old link to a page they are allowed to read.
    expect(requiredPermissionFor('/reports')).toBe(null);
    expect(requiredPermissionFor('/reports/annual')).toBe(null);
    expect(requiredPermissionFor('/attendance/entry')).toBe(null);
    expect(requiredPermissionFor('/attendance/daily')).toBe(null);
  });

  it('gates the detailed report on attendance read, not report build', () => {
    // Reading the detail is what FR-8.1 grants every colleague; producing a
    // file of it is the restricted act, and that is the export route.
    expect(requiredPermissionFor('/api/attendance/day-by-day')).toBe(
      PERMISSIONS.ATTENDANCE_READ,
    );
  });

  it('gates the audit log on audit read', () => {
    expect(requiredPermissionFor('/audit')).toBe(PERMISSIONS.AUDIT_READ);
  });

  it('gates an API route the same way as the screen it serves', () => {
    expect(requiredPermissionFor('/api/users')).toBe(PERMISSIONS.USER_READ);
  });

  it('returns undefined for an unmapped path, which is not the same as public', () => {
    // An unmapped path must be distinguishable from one deliberately mapped to
    // "no permission required", so proxy.js can 404 rather than let it through.
    expect(requiredPermissionFor('/nonsense')).toBeUndefined();
  });

  it('ignores a trailing slash rather than failing to match', () => {
    expect(requiredPermissionFor('/users/')).toBe(PERMISSIONS.USER_READ);
  });
});

import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SCOPES } from '../../constants/index.js';
import { isAdmin } from '../admin.js';

/**
 * The one place "is this viewer an administrator" is decided.
 *
 * It is a question about DATA, never about a role name: `session.js` forbids a
 * client branching on `role === 'OFFICE_ADMIN'` precisely because `FR-1.2`
 * stores the answer as an editable grant. Narrowing `user.read` on `S-19`
 * therefore takes the People tab away on the very next request.
 */

const at = (scope) => ({ [PERMISSIONS.USER_READ]: scope });

describe('isAdmin', () => {
  it('is true for a viewer whose user.read reaches the whole roster', () => {
    expect(isAdmin(at(SCOPES.ALL))).toBe(true);
  });

  it('is false for a viewer who reads only their own record', () => {
    expect(isAdmin(at(SCOPES.SELF))).toBe(false);
  });

  it('is false for a viewer who reads only their own team', () => {
    // A manager reads their team's attendance without administering anybody.
    expect(isAdmin(at(SCOPES.TEAM))).toBe(false);
  });

  it('is false for a viewer holding user.read at no scope', () => {
    expect(isAdmin({})).toBe(false);
  });

  /**
   * DC-6. A missing map is treated as holding nothing rather than everything:
   * failing open here would hand the roster to every viewer the moment
   * `permissions` went undefined.
   */
  it('is false when the permission map is missing entirely', () => {
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('is not swayed by every other permission being held at ALL', () => {
    // FR-8.1 gives an ordinary colleague attendance.read at ALL, as everyone
    // had in the old workbook. That must never read as administration.
    expect(
      isAdmin({
        [PERMISSIONS.ATTENDANCE_READ]: SCOPES.ALL,
        [PERMISSIONS.LEAVE_READ]: SCOPES.ALL,
        [PERMISSIONS.PTO_READ]: SCOPES.ALL,
        [PERMISSIONS.USER_READ]: SCOPES.SELF,
      }),
    ).toBe(false);
  });
});

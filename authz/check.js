import { ALL_PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';

/**
 * The FR-1.2 access control model, as pure functions over grant data.
 *
 * Nothing here reads the database, the session, or the request. Grants are
 * passed in, already loaded, so the rules can be exercised exhaustively in
 * tests and so the same functions serve both the endpoint check in `proxy.js`
 * and the record check in `guard.js`.
 *
 * FR-1.2 is explicit that both checks are required and neither alone is
 * enough: `resolveScope` decides *what* a role may do, `recordInScope` decides
 * *which records* that reaches.
 */

const KNOWN_ROLES = new Set(Object.values(ROLES));
const KNOWN_PERMISSIONS = new Set(ALL_PERMISSIONS);

/**
 * The endpoint check. Returns the scope this role holds the permission at, or
 * null when it holds it at no scope.
 */
export function resolveScope(grants, role, permission) {
  // FR-1.3: OFFICE_ADMIN holds every permission the system defines, now or
  // later, at ALL. This is answered before the grant data is consulted so that
  // a permission added in code — with no row seeded yet — cannot lock the
  // all-permission role out of the very screen used to grant it.
  if (role === ROLES.OFFICE_ADMIN) return SCOPES.ALL;

  if (!KNOWN_ROLES.has(role)) return null;

  const match = grants.find(
    (candidate) =>
      candidate.role === role && candidate.permission === permission,
  );

  return match ? match.scope : null;
}

/**
 * The record check. Returns whether a scope reaches a particular record.
 *
 * `actor` and `record` are both `{ userId, teamId }`. Callers normalise to that
 * shape rather than passing raw documents, so this stays independent of how any
 * one collection happens to name its fields.
 */
export function recordInScope(scope, actor, record) {
  if (scope === SCOPES.ALL) return true;

  // A missing id must never match another missing id. Comparing two undefined
  // values would otherwise silently grant access to every record lacking the
  // field — the exact kind of fallback DC-6 forbids.
  if (scope === SCOPES.TEAM) {
    return Boolean(actor?.teamId) && actor.teamId === record?.teamId;
  }

  if (scope === SCOPES.SELF) {
    return Boolean(actor?.userId) && actor.userId === record?.userId;
  }

  return false;
}

/**
 * Validates a complete grant set before it is written, enforcing FR-1.3's
 * permanent superset rule. `S-19` calls this; rejecting here rather than in the
 * UI means the invariant holds regardless of what the client sends.
 *
 * Returns `{ valid: true }` or `{ valid: false, reason }`, where the reason
 * names the offending permission or role so the screen can state it.
 */
export function validateGrants(grants) {
  for (const candidate of grants) {
    if (!KNOWN_ROLES.has(candidate.role)) {
      return {
        valid: false,
        reason: `Unknown role ${candidate.role}. The four seeded roles are the complete set; a fifth requires a schema change (FR-1.3).`,
      };
    }
    if (!KNOWN_PERMISSIONS.has(candidate.permission)) {
      return {
        valid: false,
        reason: `Unknown permission ${candidate.permission}. Every grant must name a permission from the catalog.`,
      };
    }
  }

  for (const permission of ALL_PERMISSIONS) {
    const held = grants.find(
      (candidate) =>
        candidate.role === ROLES.OFFICE_ADMIN &&
        candidate.permission === permission,
    );

    if (!held) {
      return {
        valid: false,
        reason: `OFFICE_ADMIN must hold ${permission}. A permission cannot be removed from it (FR-1.3).`,
      };
    }

    if (held.scope !== SCOPES.ALL) {
      return {
        valid: false,
        reason: `OFFICE_ADMIN must hold ${permission} at ALL. It cannot be narrowed to ${held.scope} (FR-1.3).`,
      };
    }
  }

  return { valid: true };
}

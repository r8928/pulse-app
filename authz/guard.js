import { getSessionUser } from '../session.js';
import { recordInScope } from './check.js';

/**
 * The record half of FR-1.2, for API route handlers.
 *
 * `proxy.js` has already answered "may this role do this at all". This answers
 * "does that scope reach this particular record". FR-1.2 requires both, and
 * says plainly that neither alone is enough — without this, a MANAGER holding
 * a TEAM-scoped permission could read any record by knowing its id.
 */

/** The viewer holds the permission at no scope. Surfaces as S-02. */
export class ForbiddenError extends Error {
  constructor(permission) {
    super(`You do not hold ${permission}.`);
    this.name = 'ForbiddenError';
    this.permission = permission;
  }
}

/**
 * The record exists but lies outside the viewer's scope.
 *
 * Deliberately not Forbidden. S-03: a record outside scope resolves to 404 so
 * that its existence is not leaked — answering 403 would confirm the record is
 * real to someone not permitted to know that.
 */
export class NotFoundError extends Error {
  constructor() {
    super('Not found.');
    this.name = 'NotFoundError';
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in.');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * The record a company-wide configuration endpoint is asked about.
 *
 * Employment types, authorised domains and permission grants belong to no user
 * and no team, so only a scope of ALL reaches them. FR-1.2 requires the record
 * check even where the answer is structural rather than per-record — skipping
 * it because "there is no record" is how the second half of the model gets
 * quietly dropped.
 */
export const COMPANY_WIDE = Object.freeze({ userId: null, teamId: null });

/** The signed-in user, or throws. */
export async function requireActor() {
  const actor = await getSessionUser();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/**
 * Asserts the actor holds a permission and returns the scope they hold it at.
 *
 * Handlers call this for the permission their *method* needs — `proxy.js` gates
 * on the path, which cannot distinguish a read from a write on the same route.
 */
export function assertPermission(actor, permission) {
  const scope = actor.permissions[permission];
  if (!scope) throw new ForbiddenError(permission);
  return scope;
}

/**
 * Asserts a scope reaches a record. `record` is `{ userId, teamId }`; callers
 * normalise, so this stays independent of how each collection names its fields.
 */
export function assertRecordInScope(scope, actor, record) {
  if (!recordInScope(scope, actor, record)) throw new NotFoundError();
  return record;
}

/**
 * Maps a thrown guard error to its HTTP response, so every handler answers the
 * same way and no route invents its own status for the same condition.
 */
export function guardErrorResponse(error) {
  if (error instanceof UnauthenticatedError) {
    return { status: 401, body: { error: 'Not signed in.' } };
  }
  if (error instanceof ForbiddenError) {
    return {
      status: 403,
      body: { error: error.message, permission: error.permission },
    };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: 'Not found.' } };
  }
  return null;
}

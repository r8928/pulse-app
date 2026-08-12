import { NextResponse } from 'next/server';
import { guardErrorResponse } from '../authz/guard.js';
import { StaleWriteError, ValidationError } from '../database.js';

/**
 * One error-to-response mapping for every API route, so the same condition
 * never gets two different statuses depending on which handler hit it.
 *
 *   401  not signed in
 *   403  signed in, permission not held — names the permission
 *   404  record outside the viewer's scope, so existence is not leaked
 *   400  input failed validation — carries the specific message
 *   409  stale write — carries the current state for P-47 to show
 *
 * Anything else rethrows. Swallowing an unknown error into a 500 body would
 * hide a real defect behind a tidy response.
 */
export function errorResponse(error) {
  const guard = guardErrorResponse(error);
  if (guard) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof StaleWriteError) {
    return NextResponse.json(
      { error: error.message, current: error.current },
      { status: 409 },
    );
  }

  throw error;
}

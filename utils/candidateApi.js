import { NextResponse } from 'next/server';
import {
  assertPermission,
  assertRecordInScope,
  requireActor,
} from '../authz/guard.js';
import { PERMISSIONS } from '../constants/index.js';
import { getUserById, listTrackedUserIds } from '../database.js';
import { errorResponse } from './apiResponse.js';

/**
 * The three shapes every §26.2 PTO/CTO endpoint has — list, decide, originate
 * — with only the storage and engine call left to the caller.
 *
 * CTO has no permission of its own: it spends PTO, so both halves gate on
 * `pto.read` and `pto.approve` (§22, `D-23`). Originating is a write like any
 * other — `FR-7.7`'s manual grant is an `OFFICE_ADMIN` action throughout
 * §21–§22, so reading alone never reaches it.
 */

const notFound = () =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** Resolves a candidate's owner and asserts the scope reaches them, or throws. */
async function assertOwnerInScope(scope, actor, userId) {
  const user = await getUserById(userId);
  if (!user) return null;
  assertRecordInScope(scope, actor, {
    userId: String(user._id),
    teamId: user.teamId,
  });
  return user;
}

/**
 * `S-15`'s table. Deliberately a plain read of candidate documents: `D-24`'s
 * expiry guard runs from `recalculateDays` and the balance read, and an award
 * document says the same thing before and after it posts, so sweeping here
 * would buy nothing and cost a company-wide loop.
 *
 * Narrowing follows the sibling list endpoints (`/api/attendance`,
 * `/api/leave/balances`): the record check applies when one user is asked
 * about, and a `teamId` filter is honoured when given.
 */
export async function listCandidates(request, { list }) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PTO_READ);

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const teamId = url.searchParams.get('teamId');

    if (userId && !(await assertOwnerInScope(scope, actor, userId))) {
      return notFound();
    }

    let userIds = null;
    if (userId) userIds = [userId];
    else if (teamId) userIds = await listTrackedUserIds({ teamId });

    const items = await list({
      userIds,
      status: url.searchParams.get('status'),
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
    });

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * `P-01`, `P-03`, `P-27`. `decide` receives the parsed body and returns the
 * updated record, or `null` where the engine found nothing to act on. Every
 * refusal below it — a missing reason, a stale `version`, `BR-26`'s
 * insufficient balance — surfaces through `errorResponse`, so no handler
 * invents its own status for a condition another one already answers.
 */
export async function decideOnCandidate(request, context, { load, decide }) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PTO_APPROVE);

    const { id } = await context.params;
    const record = await load(id);
    if (!record) return notFound();

    if (!(await assertOwnerInScope(scope, actor, record.userId))) {
      return notFound();
    }

    const after = await decide(id, await request.json(), actor);
    return after ? NextResponse.json(after) : notFound();
  } catch (error) {
    return errorResponse(error);
  }
}

/** `P-04`, `FR-7.7`. Creates and approves in one action, so it answers 201. */
export async function originateCandidate(request, { originate }) {
  try {
    const actor = await requireActor();
    const scope = assertPermission(actor, PERMISSIONS.PTO_APPROVE);

    const body = await request.json();
    if (!(await assertOwnerInScope(scope, actor, body.userId))) {
      return notFound();
    }

    const created = await originate(body, actor);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

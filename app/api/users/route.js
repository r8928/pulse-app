import { NextResponse } from 'next/server';
import { assertPermission, requireActor } from '../../../authz/guard.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { createUser, listUsers } from '../../../database.js';
import { errorResponse } from '../../../utils/apiResponse.js';

/**
 * proxy.js has already gated this path on user.read. These handlers assert the
 * permission their *method* needs, which the path alone cannot express — a
 * POST here creates a user and must require user.write.
 */

export async function GET(request) {
  try {
    const actor = await requireActor();
    assertPermission(actor, PERMISSIONS.USER_READ);

    const url = new URL(request.url);
    const result = await listUsers({
      search: url.searchParams.get('search') ?? '',
      teamId: url.searchParams.get('teamId'),
      role: url.searchParams.get('role'),
      employmentType: url.searchParams.get('employmentType'),
      tracked:
        url.searchParams.get('tracked') === null
          ? null
          : url.searchParams.get('tracked') === 'true',
      includeDeleted: url.searchParams.get('includeDeleted') !== 'false',
      page: Number(url.searchParams.get('page') ?? 1),
      pageSize: Number(url.searchParams.get('pageSize') ?? 25),
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    assertPermission(actor, PERMISSIONS.USER_WRITE);

    const body = await request.json();
    const user = await createUser(body, actor);

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

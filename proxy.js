import { NextResponse } from 'next/server';
import { auth } from './auth.js';
import { resolveScope } from './authz/check.js';
import { isPublicPath, requiredPermissionFor } from './authz/routes.js';
import { findUserByWorkEmail, getPermissionGrants } from './database.js';

/**
 * The single centralised validator for every page and API route.
 *
 * CLAUDE.md: no auth guard or unauthenticated redirect lives anywhere else,
 * and no individual API route is monkey-patched with its own check.
 *
 * This runs on the Node.js runtime — in Next 16 `proxy.js` defaults to it and
 * the runtime cannot be reconfigured — so it can query MongoDB directly. That
 * is what makes FR-1.2 achievable: grants are read per request, so narrowing a
 * scope on S-19 takes effect on the very next request with no redeploy and no
 * restart (MVP criteria 4 and 7).
 *
 * This is the endpoint check only. The record check — does the resolved scope
 * reach *this particular record* — is `guard.js`, called by the handler.
 * FR-1.2 is explicit that both are required and neither alone is enough.
 */
export const proxy = auth(async (request) => {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const email = request.auth?.user?.email;
  if (!email) {
    const signin = new URL('/signin', request.nextUrl);
    signin.searchParams.set('from', pathname);
    return NextResponse.redirect(signin);
  }

  const permission = requiredPermissionFor(pathname);

  // An unmapped path is not a public one. Answering 404 rather than letting it
  // through means a route added without a rule fails closed (DC-6).
  if (permission === undefined) {
    return NextResponse.rewrite(new URL('/404', request.nextUrl));
  }

  const user = await findUserByWorkEmail(email);

  // Re-checked every request, not trusted from the token: a user soft deleted
  // or with login disabled mid-session loses access at once (FR-1.5, FR-2.4).
  if (!user || user.deletedAt || !user.loginEnabled) {
    const signin = new URL('/signin', request.nextUrl);
    signin.searchParams.set('reason', 'SESSION_NO_LONGER_VALID');
    return NextResponse.redirect(signin);
  }

  // Reachable by any signed-in user, whatever they hold.
  if (permission === null) {
    return NextResponse.next();
  }

  const grants = await getPermissionGrants();
  const scope = resolveScope(grants, user.role, permission);

  if (!scope) {
    // S-02 names the permission the viewer lacks, so a narrowed scope is
    // diagnosable rather than mysterious.
    const denied = new URL('/403', request.nextUrl);
    denied.searchParams.set('permission', permission);
    return NextResponse.redirect(denied);
  }

  // Hand the resolved decision downstream so a handler need not resolve it a
  // second time to run its record check.
  const headers = new Headers(request.headers);
  headers.set('x-pulse-user-id', String(user._id));
  headers.set('x-pulse-scope', scope);
  headers.set('x-pulse-permission', permission);

  return NextResponse.next({ request: { headers } });
});

export const config = {
  /**
   * Everything except Next's own assets and the favicon. Auth.js callback
   * routes are matched but treated as public by `isPublicPath`, so sign-in can
   * complete.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};

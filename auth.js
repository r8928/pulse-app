import { formatISO } from 'date-fns';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { evaluateSignIn } from './authz/signin.js';
import {
  findUserByWorkEmail,
  getAuthorisedDomains,
  recordSignInAttempt,
} from './database.js';

/**
 * Google sign-in (FR-1.1, DC-8). Pulse stores and verifies no password.
 *
 * Deliberately no database adapter. An adapter owns its own `users`,
 * `accounts` and `sessions` collections — the separate account entity FR-2.5
 * forbids. A JWT session keeps the user a single entity, with sign-in ability
 * following from work email and the login-enabled flag.
 *
 * The token carries identity only. Role, team and permission grants are
 * re-read on every request by `proxy.js` and `session.js`, never baked in
 * here: FR-1.7 requires a role change to take effect on the next request, and
 * FR-1.2 requires a permission change to do the same. Caching either in the
 * token would mean signing out and back in before an S-19 edit took hold,
 * quietly breaking MVP criteria 4 and 7.
 *
 * All Auth.js usage is confined to this file and `session.js`, so the library
 * being pre-release is a two-file risk rather than an application-wide one.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/signin',
    error: '/signin',
  },

  callbacks: {
    /**
     * FR-1.5. The decision itself lives in `evaluateSignIn`; this callback
     * supplies it with data and records the outcome.
     */
    async signIn({ profile }) {
      const email = profile?.email;

      if (!email) {
        await recordSignInAttempt({
          email: null,
          allowed: false,
          reason: 'NO_EMAIL_ON_PROFILE',
        });
        return '/signin?reason=NO_EMAIL_ON_PROFILE';
      }

      const [authorisedDomains, user] = await Promise.all([
        getAuthorisedDomains(),
        findUserByWorkEmail(email),
      ]);

      const decision = evaluateSignIn({
        email,
        user,
        authorisedDomains,
        onDate: formatISO(new Date(), { representation: 'date' }),
      });

      // FR-1.6: every authentication event, successful or failed.
      await recordSignInAttempt({
        email,
        allowed: decision.allowed,
        reason: decision.reason,
      });

      // S-01 shows one of five distinct reasons rather than a generic failure,
      // so the reason travels back on the query string.
      return decision.allowed ? true : `/signin?reason=${decision.reason}`;
    },

    async jwt({ token, profile }) {
      if (profile?.email) {
        token.email = profile.email.toLowerCase();
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email;
      }
      return session;
    },
  },
});

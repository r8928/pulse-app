import { AppShell } from '../../components/AppShell.jsx';
import { getSessionUser } from '../../session.js';
import { signOutAction } from './actions.js';

/**
 * The authenticated shell.
 *
 * This performs no auth check of its own. `proxy.js` is the single centralised
 * validator and has already rejected anyone who should not be here; this
 * layout only reads the session and hands `user` down as a prop, which is the
 * one-way flow CLAUDE.md requires.
 *
 * The assertion below is an invariant, not a guard: reaching here without a
 * user means proxy.js and this layout disagree, and failing loudly is better
 * than a TypeError three components deep or a redirect loop between the two.
 */
export default async function AppLayout({ children }) {
  const user = await getSessionUser();

  if (!user) {
    throw new Error(
      'No session in the authenticated layout. proxy.js should have redirected to /signin before this rendered.',
    );
  }

  return (
    <AppShell user={user} signOutAction={signOutAction}>
      {children}
    </AppShell>
  );
}

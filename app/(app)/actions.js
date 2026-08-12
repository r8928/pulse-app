'use server';

import { signOut } from '../../auth.js';

export async function signOutAction() {
  await signOut({ redirectTo: '/signin' });
}

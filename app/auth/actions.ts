'use server'

import { signOut } from '@/auth'

// Server action used by the avatar dropdown's Sign-out item.
// Kept in a dedicated actions file rather than inline on the
// header component so the client menu can import it cleanly.
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/auth/signin' })
}

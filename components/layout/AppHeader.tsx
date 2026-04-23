import Link from 'next/link'
import { auth } from '@/auth'
import { resolveRole } from '@/modules/roles/resolver'
import { AppNav } from './AppNav'
import { UserMenu } from './UserMenu'
import { ViewSwitcher } from './ViewSwitcher'

// Global header rendered once in app/layout.tsx. Wordmark + primary nav
// + user indicator. The nav itself lives in AppNav (client) so it can
// react to the demo view-switcher's ?view= query; the server-side role
// resolution happens here and is handed down as a prop.
export async function AppHeader() {
  const session = await auth()
  const employeeId = session?.user?.employeeId ?? null

  const role = employeeId ? await resolveRole(employeeId) : null

  return (
    <header className="sticky top-0 z-40 border-b border-novo-border bg-novo-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-shell items-center gap-8 px-6">
        <Link
          href={employeeId ? '/dashboard' : '/auth/signin'}
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-novo-ink hover:opacity-80"
        >
          <Wordmark />
          <span className="hidden sm:inline">Novo Rewards</span>
        </Link>

        {role && <AppNav role={role} />}

        <div className="ml-auto flex items-center gap-3">
          {employeeId && session?.user ? (
            <>
              {role && <ViewSwitcher role={role} />}
              <Link
                href="/nominations/new"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-novo-ink px-3 text-xs font-medium text-novo-paper shadow-card hover:bg-novo-ink/90"
              >
                <span aria-hidden>+</span>
                Recognize
              </Link>
              <UserMenu
                name={session.user.name ?? session.user.email ?? 'Signed in'}
                email={session.user.email ?? null}
                roleTitle={session.user.roleTitle ?? null}
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function Wordmark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="text-novo-ink"
      aria-hidden
    >
      <rect x="1" y="1" width="18" height="18" rx="4" fill="currentColor" />
      <path
        d="M6 14V6l4 5.5V6l4 8"
        stroke="#FAFAF7"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

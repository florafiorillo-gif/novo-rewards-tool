import { auth } from '@/auth'
import { resolveRole } from '@/modules/roles/resolver'
import { AppNav } from './AppNav'
import { KeepViewLink } from './KeepViewLink'
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
        <KeepViewLink
          href={employeeId ? '/dashboard' : '/auth/signin'}
          className="flex items-baseline gap-1.5 hover:opacity-80"
          aria-label="Novo Rewards home"
        >
          <span className="font-display text-lg leading-none tracking-tight text-novo-ink">
            novo
          </span>
          <span className="hidden text-xs uppercase tracking-[0.12em] text-novo-subtle sm:inline">
            Rewards
          </span>
        </KeepViewLink>

        {role && <AppNav role={role} />}

        <div className="ml-auto flex items-center gap-3">
          {employeeId && session?.user ? (
            <>
              {role && <ViewSwitcher role={role} />}
              <KeepViewLink
                href="/nominations/new"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-novo-coral px-3 text-xs font-medium text-novo-paper shadow-card hover:bg-novo-coral/90"
              >
                <span aria-hidden>+</span>
                Recognize
              </KeepViewLink>
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


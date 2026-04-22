import Link from 'next/link'
import { auth } from '@/auth'
import {
  isCommitteeMember,
  isPeopleTeamRep,
} from '@/modules/roles/service'

// Global header rendered once in app/layout.tsx. Wordmark + primary nav +
// user indicator. Nav items are filtered by role so the committee/people-ops
// surfaces don't leak into a regular employee's nav.

export async function AppHeader() {
  const session = await auth()
  const employeeId = session?.user?.employeeId ?? null

  const [isCommittee, isPeopleOps] = employeeId
    ? await Promise.all([
        isCommitteeMember(employeeId),
        isPeopleTeamRep(employeeId),
      ])
    : [false, false]

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

        {employeeId && (
          <nav
            aria-label="Primary"
            className="hidden flex-1 items-center gap-1 text-sm md:flex"
          >
            <NavLink href="/dashboard">Home</NavLink>
            <NavLink href="/approvals/queue">Inbox</NavLink>
            <NavLink href="/dashboard/me">Your recognitions</NavLink>
            {isCommittee && (
              <NavLink href="/committee/dashboard">Committee</NavLink>
            )}
            {isPeopleOps && <NavLink href="/people-ops">People Ops</NavLink>}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {employeeId && session?.user ? (
            <>
              <Link
                href="/nominations/new"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-novo-ink px-3 text-xs font-medium text-novo-paper shadow-card hover:bg-novo-ink/90"
              >
                <span aria-hidden>+</span>
                Recognize
              </Link>
              <UserIndicator
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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-sm text-novo-subtle transition hover:bg-novo-hover hover:text-novo-ink"
    >
      {children}
    </Link>
  )
}

function UserIndicator({
  name,
  email,
  roleTitle,
}: {
  name: string
  email: string | null
  roleTitle: string | null
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <Link
      href="/settings"
      className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-novo-hover"
      title={email ?? undefined}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-full bg-novo-ink text-2xs font-semibold text-novo-paper"
      >
        {initials || '·'}
      </span>
      <span className="hidden leading-tight sm:block">
        <span className="block font-medium text-novo-ink">{name}</span>
        {roleTitle && (
          <span className="block text-2xs text-novo-muted">{roleTitle}</span>
        )}
      </span>
    </Link>
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

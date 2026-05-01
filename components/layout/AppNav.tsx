'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import {
  activeViews,
  navItemsForActiveViews,
  parseViewParam,
} from '@/modules/dashboard/views'
import type { ResolvedRole } from '@/modules/roles/resolver'
import { KeepViewLink } from './KeepViewLink'

// Role-aware primary nav. Client-rendered because the item set has
// to react to the demo view-switcher's ?view= query param — when a
// tester simulates a view, the nav narrows to that view's items
// (matching the brief: "tester simulating Employee sees only
// employee nav items").
//
// When no ?view= is present, we fall through to the union of nav
// items contributed by the viewer's real roles. Shared items
// (Home, My recognitions) render for everyone.
//
// DEMO-MODE NOTE: the simulation-driven narrowing is tied to the
// view-switcher feature, which ships gated for pre-launch demos
// only. See modules/dashboard/views.ts for the removal/flag note.
export function AppNav({ role }: { role: ResolvedRole }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const simulated = parseViewParam(searchParams?.get('view'))
  const views = activeViews(role, simulated)
  const items = navItemsForActiveViews(views)

  return (
    <nav
      aria-label="Primary"
      className="hidden flex-1 items-center gap-1 text-sm md:flex"
    >
      {items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          active={isActive(pathname, item.href)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string
  children: React.ReactNode
  active: boolean
}) {
  return (
    <KeepViewLink
      href={href}
      className={`rounded-md px-2.5 py-1.5 text-sm transition ${
        active
          ? 'bg-novo-hover text-novo-ink'
          : 'text-novo-subtle hover:bg-novo-hover hover:text-novo-ink'
      }`}
    >
      {children}
    </KeepViewLink>
  )
}

// Highlight the nav item whose href matches the current path.
// Exact match for leaf routes (/dashboard, /dashboard/me,
// /dashboard/team, /review); prefix match for hub-style items
// (/people-ops, /leadership) so sub-routes still light up the
// parent. /dashboard is intentionally exact — /dashboard/me and
// /dashboard/team shouldn't keep "Home" highlighted.
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (
    href === '/dashboard' ||
    href === '/dashboard/me' ||
    href === '/dashboard/team'
  ) {
    return pathname === href
  }
  if (href === '/review') return pathname === '/review'
  return pathname === href || pathname.startsWith(href + '/')
}

'use client'

import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  ALL_VIEWS,
  VIEW_LABELS,
  parseViewParam,
  type DashboardView,
} from '@/modules/dashboard/views'
import type { ResolvedRole } from '@/modules/roles/resolver'

// Path prefixes whose pages enforce a real-role gate. Selecting a sim
// view that doesn't match these prefixes from inside one bounces back
// to /dashboard so the user lands in their chosen view's home rather
// than on a page that doesn't match the chrome (or 404s in the worst
// case for testers without the real role).
const REAL_ROLE_GATED_PATHS: Array<[string, DashboardView]> = [
  ['/dashboard/team', 'manager'],
  ['/leadership', 'committee'],
  ['/people-ops', 'people_ops'],
]

function pathRequiredView(path: string): DashboardView | null {
  for (const [prefix, view] of REAL_ROLE_GATED_PATHS) {
    if (path === prefix || path.startsWith(prefix + '/')) return view
  }
  return null
}

// Builds the href the dropdown's "View as X" / "Reset" entries should
// navigate to. Default is preserve-path-update-view; the exception is
// when the current path is real-role-gated to a different view, in
// which case we redirect to /dashboard?view=X.
function buildSwitcherHref(
  view: DashboardView | null,
  currentPath: string,
  currentSearch: string
): string {
  // Reset: clear ?view=, keep path. The merged-real-roles fallback
  // already gated access if the user is on the page now.
  if (!view) {
    const next = new URLSearchParams(currentSearch)
    next.delete('view')
    const qs = next.toString()
    return qs ? `${currentPath}?${qs}` : currentPath
  }
  const required = pathRequiredView(currentPath)
  if (required && required !== view) {
    return `/dashboard?view=${view}`
  }
  const next = new URLSearchParams(currentSearch)
  next.set('view', view)
  return `${currentPath}?${next.toString()}`
}

// DEMO-MODE ONLY. This switcher lets a signed-in user preview the
// dashboard as any of the four views (Employee / Manager / People Ops
// / Committee) — useful for walking testers through the app without
// swapping accounts. Read-only: it changes what widgets compose, not
// what the signed-in user is allowed to do. Server actions for Tier 2
// / Tier 3 / catalog / fulfillment still gate on the viewer's real
// role via modules/roles/service.
//
// Remove, or gate behind process.env.NODE_ENV !== 'production' (or a
// feature flag), before production launch. See
// modules/dashboard/views.ts for the full policy note.

export function ViewSwitcher({ role }: { role: ResolvedRole }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const simulated = parseViewParam(searchParams?.get('view'))
  // Active label only when a simulation is on. With no sim we show
  // "View as" with no role — a visually distinct "no simulation" state
  // so testers don't mistake the merged-roles fallback for an active
  // Leadership sim (the previous fallback was highestRealView, which
  // for committee+manager viewers always read "Leadership").
  const isSimulating = simulated !== null
  const realSet = new Set<DashboardView>(['employee'])
  if (role.is_manager) realSet.add('manager')
  if (role.is_people_team) realSet.add('people_ops')
  if (role.is_committee) realSet.add('committee')

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        e.target instanceof Node &&
        !wrapperRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Selecting a view from the dropdown preserves the current path and
  // updates the ?view= param; selecting "Reset" clears the param and
  // keeps the path. The exception lives in buildSwitcherHref —
  // real-role-gated paths bounce to /dashboard when the chosen sim
  // view doesn't match. Link navigation rather than push so the
  // browser back button still works for tester walkthroughs.
  const currentSearch = searchParams?.toString() ?? ''
  function hrefFor(view: DashboardView | null): string {
    return buildSwitcherHref(view, pathname ?? '/dashboard', currentSearch)
  }

  const label = isSimulating ? VIEW_LABELS[simulated] : null

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-novo-border bg-novo-paper px-2.5 text-xs text-novo-ink shadow-card hover:bg-novo-hover"
        title="Demo: switch dashboard view"
      >
        <span className="text-novo-muted">View as</span>
        {label && <span className="font-medium">{label}</span>}
        {isSimulating && (
          <span className="ml-0.5 rounded bg-novo-lime px-1 text-2xs font-medium text-novo-ink">
            sim
          </span>
        )}
        <span aria-hidden className="text-novo-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-novo-border bg-novo-elevated p-1 shadow-elevated"
        >
          <p className="px-3 pb-1 pt-2 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            Preview dashboard as
          </p>
          {ALL_VIEWS.map((v) => {
            // Highlighted only when the user is actively simulating this
            // exact view. With no sim, no row is "active" — matches the
            // "View as" empty-label state on the trigger.
            const isActive = simulated === v
            const isReal = realSet.has(v)
            return (
              <Link
                key={v}
                role="menuitem"
                href={hrefFor(v)}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-novo-ink text-novo-paper'
                    : 'text-novo-ink hover:bg-novo-hover'
                }`}
              >
                <span>{VIEW_LABELS[v]}</span>
                <span
                  className={`text-2xs uppercase tracking-[0.08em] ${
                    isActive ? 'text-white/70' : 'text-novo-muted'
                  }`}
                >
                  {isReal ? 'your role' : 'simulated'}
                </span>
              </Link>
            )
          })}
          <div className="my-1 border-t border-novo-border" />
          <Link
            role="menuitem"
            href={hrefFor(null)}
            onClick={() => setOpen(false)}
            className={`block rounded-md px-3 py-2 text-xs ${
              simulated === null
                ? 'text-novo-muted'
                : 'text-novo-ink hover:bg-novo-hover'
            }`}
          >
            Reset to default
            <span className="ml-1 text-novo-muted">(all your roles)</span>
          </Link>
          <p className="px-3 pb-2 pt-1 text-2xs text-novo-muted">
            Simulation only. Approvals and committee actions still
            require your real role.
          </p>
          <p className="px-3 pb-2 text-2xs text-novo-muted">
            Current path: <span className="font-mono">{pathname}</span>
          </p>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  ALL_VIEWS,
  VIEW_LABELS,
  highestRealView,
  parseViewParam,
  type DashboardView,
} from '@/modules/dashboard/views'
import type { ResolvedRole } from '@/modules/roles/resolver'

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
  const active = simulated ?? highestRealView(role)
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

  // Each option links to /dashboard?view=X. The "Reset" option at
  // the bottom clears the query param and returns to the default
  // merged view. Link navigation is used rather than a button + push
  // so the browser back/forward still works for tester walkthroughs.
  function hrefFor(view: DashboardView | null): string {
    if (!view) return '/dashboard'
    return `/dashboard?view=${view}`
  }

  const label = VIEW_LABELS[active]
  const simulatedBadge = simulated !== null

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
        <span className="font-medium">{label}</span>
        {simulatedBadge && (
          <span className="ml-0.5 rounded border border-novo-border bg-novo-hover px-1 text-2xs font-medium text-novo-subtle">
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
            const isActive = active === v && simulated !== null
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
            Simulation only — approvals and committee actions still
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

'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ComponentProps, ReactNode } from 'react'

// View-aware drop-in for next/link. When the current URL carries a
// valid demo-mode ?view= simulation, every internal nav link must
// carry it forward — otherwise clicking "+ Recognize" or "My team"
// drops the simulation and the next page re-resolves to the user's
// real role view (the bug Flora hit on 2026-04-30).
//
// Only used inside the persistent header / nav and inline action
// buttons that should keep the simulation alive. Out-of-band link
// destinations (e.g. external URLs in evidence_links) intentionally
// don't go through this.

const VALID_VIEWS = new Set(['employee', 'manager', 'people_ops', 'committee'])

interface Props extends Omit<ComponentProps<typeof Link>, 'href'> {
  href: string
  children: ReactNode
}

export function KeepViewLink({ href, children, ...rest }: Props) {
  const searchParams = useSearchParams()
  const raw = searchParams?.get('view')
  const view = raw && VALID_VIEWS.has(raw) ? raw : null
  const finalHref = view ? appendQuery(href, 'view', view) : href
  return (
    <Link href={finalHref} {...rest}>
      {children}
    </Link>
  )
}

function appendQuery(href: string, key: string, value: string): string {
  // Preserve any existing query string on the target href (e.g.
  // /nominations/new?nominee=emp_042 → keep nominee, append view).
  // External URLs are out of scope; persistent-nav links are always
  // relative paths.
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}${key}=${encodeURIComponent(value)}`
}

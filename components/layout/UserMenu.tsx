'use client'

import { useEffect, useRef, useState } from 'react'
import { signOutAction } from '@/app/auth/actions'
import { KeepViewLink } from './KeepViewLink'

// Avatar + dropdown. Replaces the single-link UserIndicator so
// "My recognitions" (/dashboard/me) is one click away for every
// signed-in user even though it's no longer in the primary nav.
//
// The trigger is the same visual as before — round ink-filled
// initials plus name/role on wider screens — but clicking now
// opens a three-item menu: My recognitions, Settings, Sign out.
export function UserMenu({
  name,
  email,
  roleTitle,
}: {
  name: string
  email: string | null
  roleTitle: string | null
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

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

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
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
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-novo-border bg-novo-elevated p-1 shadow-elevated"
        >
          {email && (
            <p className="px-3 pb-1 pt-2 text-2xs text-novo-muted">
              {email}
            </p>
          )}
          <KeepViewLink
            role="menuitem"
            href="/dashboard/me"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm text-novo-ink hover:bg-novo-hover"
          >
            My recognitions
          </KeepViewLink>
          <KeepViewLink
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm text-novo-ink hover:bg-novo-hover"
          >
            Settings
          </KeepViewLink>
          <div className="my-1 border-t border-novo-border" />
          <form action={signOutAction}>
            <button
              role="menuitem"
              type="submit"
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-novo-ink hover:bg-novo-hover"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

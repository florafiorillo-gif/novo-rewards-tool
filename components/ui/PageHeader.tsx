import type { ReactNode } from 'react'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

interface PageHeaderProps {
  /** Eyebrow label rendered above the title, e.g. "Committee". */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-side actions (buttons, links). */
  actions?: ReactNode
  /** Optional back-link rendered above the eyebrow. */
  back?: { href: string; label: string }
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: PageHeaderProps) {
  return (
    <header className="mb-8">
      {back && (
        <KeepViewLink
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 text-xs text-novo-subtle hover:text-novo-ink"
        >
          <span aria-hidden>←</span>
          {back.label}
        </KeepViewLink>
      )}
      <div className="flex items-end justify-between gap-6">
        <div>
          {eyebrow && (
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-novo-subtle">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

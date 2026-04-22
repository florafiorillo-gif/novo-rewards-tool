import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: ReactNode
  action?: ReactNode
  /** Small hint text under the action, e.g. a secondary path or explanation. */
  footnote?: ReactNode
  /** Controls vertical padding. "compact" for inline, "default" for full page. */
  density?: 'compact' | 'default'
}

export function EmptyState({
  title,
  description,
  action,
  footnote,
  density = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={`mx-auto flex max-w-md flex-col items-center text-center ${
        density === 'compact' ? 'py-8' : 'py-16'
      }`}
    >
      <h3 className="text-base font-semibold text-novo-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-novo-subtle">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {footnote && (
        <p className="mt-3 text-xs text-novo-muted">{footnote}</p>
      )}
    </div>
  )
}

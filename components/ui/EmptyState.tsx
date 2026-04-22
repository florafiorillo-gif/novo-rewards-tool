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
      {/* Subtle graphic: a pair of crossed dashes. Linear-style restraint. */}
      <div
        aria-hidden
        className="mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-novo-border text-novo-muted"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M6 12h12" />
          <path d="M12 6v12" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-novo-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-novo-subtle">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {footnote && (
        <p className="mt-3 text-xs text-novo-muted">{footnote}</p>
      )}
    </div>
  )
}

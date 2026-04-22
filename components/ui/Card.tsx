import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  as?: 'section' | 'article' | 'div'
  padded?: boolean
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  padded = true,
}: CardProps) {
  return (
    <Tag
      className={`rounded-lg border border-novo-border bg-novo-elevated shadow-card ${
        padded ? 'p-5' : ''
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-novo-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-novo-subtle">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

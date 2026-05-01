import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  // Primary action — Novo red. Hover slightly darker. Disabled state
  // muted via the BASE `disabled:opacity-50` already in place.
  primary:
    'bg-novo-coral text-novo-paper hover:bg-novo-coral/90 active:bg-novo-coral shadow-card',
  secondary:
    'border border-novo-border bg-novo-paper text-novo-ink hover:bg-novo-hover',
  ghost:
    'bg-transparent text-novo-subtle hover:bg-novo-hover hover:text-novo-ink',
  // Danger now overlaps visually with primary — both Novo red. Kept as
  // a separate variant for callsite intent (one is "ship it",
  // other is "destroy it") and so we can diverge later if needed.
  danger:
    'bg-novo-coral text-novo-paper hover:bg-novo-coral/90 shadow-card',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-4 text-sm',
}

interface CommonProps {
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

interface LinkButtonProps extends CommonProps {
  href: string
  prefetch?: boolean
}

// Wraps KeepViewLink (not a plain next/link) so any active demo-mode
// ?view= simulation persists across the click. This is the default
// because every LinkButton in the app today targets an internal route;
// if a future caller needs to opt out for an external destination, add
// a `keepView={false}` escape hatch then.
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  prefetch,
}: LinkButtonProps) {
  return (
    <KeepViewLink
      href={href}
      prefetch={prefetch}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </KeepViewLink>
  )
}

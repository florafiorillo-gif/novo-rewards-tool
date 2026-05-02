import type { BudgetPeriodRecord } from '@/modules/budget/types'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

// Committee-focused "where are we in the period" card. Complements
// ProgramHealthCard (which says *how much* is committed) with *when*
// the period closes and whether the grace window is open. Budget
// mechanics live on /committee/budget; this card is the pulse.
// `disabled` renders the action link as a non-clickable muted control
// for users in a simulated view who don't actually hold committee role.
// Same rationale as TierThreeQueueCard: /leadership/budget itself
// real-role-gates committee, so the click would 404 in sim.
export function BudgetPeriodStatusCard({
  period,
  inGrace,
  graceEndsAt,
  now = new Date(),
  disabled = false,
}: {
  period: BudgetPeriodRecord
  inGrace: boolean
  graceEndsAt: Date | null
  now?: Date
  disabled?: boolean
}) {
  const end = new Date(period.end_date)
  const daysToEnd = daysBetween(now, end)

  let statusLabel: string
  let statusDetail: string
  let tone: 'active' | 'grace' | 'closing' | 'neutral'

  if (inGrace && graceEndsAt) {
    statusLabel = 'Grace period'
    statusDetail = `Pools drawable through ${formatDate(graceEndsAt)}`
    tone = 'grace'
  } else if (daysToEnd < 0) {
    statusLabel = 'Closed'
    statusDetail = `Ended ${formatDate(end)}`
    tone = 'neutral'
  } else if (daysToEnd <= 14) {
    statusLabel = `Closes in ${daysToEnd}d`
    statusDetail = `Ends ${formatDate(end)}`
    tone = 'closing'
  } else {
    statusLabel = 'Active'
    statusDetail = `${daysToEnd} days remaining · ends ${formatDate(end)}`
    tone = 'active'
  }

  return (
    <section className="rounded-lg border border-novo-border bg-novo-elevated p-5 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        Budget period
      </p>
      <p className="mt-1 text-lg font-semibold text-novo-ink">
        {period.period_label}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <StatusChip tone={tone}>{statusLabel}</StatusChip>
      </div>
      <p className="mt-2 text-xs text-novo-subtle">{statusDetail}</p>
      {disabled ? (
        <button
          type="button"
          disabled
          title="Available in your real role only"
          className="mt-4 inline-flex cursor-not-allowed items-center gap-1 text-xs font-medium text-novo-muted"
        >
          Open budget <span aria-hidden>→</span>
        </button>
      ) : (
        <KeepViewLink
          href="/leadership/budget"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-novo-ink hover:opacity-80"
        >
          Open budget <span aria-hidden>→</span>
        </KeepViewLink>
      )}
    </section>
  )
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusChip({
  tone,
  children,
}: {
  tone: 'active' | 'grace' | 'closing' | 'neutral'
  children: React.ReactNode
}) {
  const toneClass = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    grace: 'border-amber-200 bg-amber-50 text-amber-900',
    closing: 'border-amber-200 bg-amber-50 text-amber-900',
    neutral: 'border-novo-border bg-novo-surface text-novo-subtle',
  }[tone]
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-2xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  )
}

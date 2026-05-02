import type { PeopleTeamDashboardView } from '@/modules/dashboard/people-team-view'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

// Compact summary of program-level health for the dashboard sidebar.
// Full tables (per-geo pools, exception details, SLA miss rows) live on
// /people-ops/dashboard; this card surfaces three numbers + a link so
// the People team sees the pulse from the landing without burying the
// feed under admin chrome.
// `disabled` renders the action link as a non-clickable muted control
// for users in a simulated view who don't actually hold the role the
// destination requires (committee for /leadership/dashboard, people-ops
// for /people-ops/dashboard).
export function ProgramHealthCard({
  view,
  href,
  eyebrow,
  disabled = false,
}: {
  view: PeopleTeamDashboardView
  href: string
  eyebrow: string
  disabled?: boolean
}) {
  const totals = aggregate(view)
  const hasFlag = totals.exception_count > 0 || totals.sla_miss_count > 0

  return (
    <section className="rounded-lg border border-novo-border bg-novo-elevated p-5 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        {eyebrow}
      </p>
      {view.period ? (
        <p className="mt-1 text-xs text-novo-subtle">
          {view.period.period_label} · program-wide
        </p>
      ) : (
        <p className="mt-1 text-xs text-novo-subtle">No active period</p>
      )}

      <dl className="mt-3 space-y-2.5">
        <Row
          label="Committed"
          value={`${Math.round(totals.spent_pct)}%`}
          detail={`${fmt(totals.spent_usd)} of ${fmt(totals.allocated_usd)}`}
        />
        <Row
          label="Exceptions drawn"
          value={String(totals.exception_count)}
          detail={totals.exception_count === 0 ? 'None this period' : 'From reserve'}
          tone={totals.exception_count > 0 ? 'warn' : 'neutral'}
        />
        <Row
          label="SLA misses"
          value={String(totals.sla_miss_count)}
          detail={
            totals.sla_miss_count === 0
              ? 'None this period'
              : 'Escalated or auto-denied'
          }
          tone={totals.sla_miss_count > 0 ? 'warn' : 'neutral'}
        />
      </dl>

      {disabled ? (
        <button
          type="button"
          disabled
          title="Available in your real role only"
          className="mt-4 inline-flex cursor-not-allowed items-center gap-1 text-xs font-medium text-novo-muted"
        >
          {hasFlag ? 'See full program view' : 'Open program view'}{' '}
          <span aria-hidden>→</span>
        </button>
      ) : (
        <KeepViewLink
          href={href}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-novo-ink hover:opacity-80"
        >
          {hasFlag ? 'See full program view' : 'Open program view'}{' '}
          <span aria-hidden>→</span>
        </KeepViewLink>
      )}
    </section>
  )
}

function Row({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'warn'
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-amber-700'
      : 'text-novo-ink'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-sm text-novo-subtle">{label}</dt>
        <dd className="mt-0.5 text-2xs text-novo-muted">{detail}</dd>
      </div>
      <span className={`text-lg font-semibold tabular ${valueClass}`}>{value}</span>
    </div>
  )
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

interface AggregatedTotals {
  allocated_usd: number
  spent_usd: number
  spent_pct: number
  exception_count: number
  sla_miss_count: number
}

function aggregate(view: PeopleTeamDashboardView): AggregatedTotals {
  let allocated_usd = 0
  let spent_usd = 0
  for (const group of view.pools_by_geo) {
    allocated_usd += group.allocated_usd
    spent_usd += group.spent_usd
  }
  if (view.reserve) {
    allocated_usd += view.reserve.pool.allocated_amount_usd
    spent_usd += view.reserve.pool.spent_amount_usd
  }
  if (view.tier3_pool) {
    allocated_usd += view.tier3_pool.pool.allocated_amount_usd
    spent_usd += view.tier3_pool.pool.spent_amount_usd
  }
  const spent_pct = allocated_usd === 0 ? 0 : (spent_usd / allocated_usd) * 100
  return {
    allocated_usd,
    spent_usd,
    spent_pct,
    exception_count: view.exceptions.length,
    sla_miss_count: view.sla_misses.length,
  }
}

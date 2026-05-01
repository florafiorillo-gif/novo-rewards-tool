import type {
  BudgetPeriodRecord,
  BudgetPoolRecord,
  PacingIndicator,
} from '@/modules/budget/types'
import { Card } from '@/components/ui/Card'

interface Props {
  period: BudgetPeriodRecord
  pool: BudgetPoolRecord
  pacing: PacingIndicator
  in_grace?: boolean
  grace_ends_at?: Date | null
}

function pacingChip(p: PacingIndicator): {
  label: string
  tone: 'positive' | 'warning' | 'neutral'
  hint: string
} {
  switch (p) {
    case 'on_track':
      return { label: 'On track', tone: 'positive', hint: 'Pacing matches the quarter.' }
    case 'running_hot':
      return {
        label: 'Running hot',
        tone: 'warning',
        hint: 'Spending ahead of pace. Worth a look before quarter-end.',
      }
    case 'under_utilized':
      return {
        label: 'Under-utilized',
        tone: 'neutral',
        hint: 'There is room to recognize more this quarter.',
      }
    default: {
      const _exhaustive: never = p
      throw new Error(`unknown pacing indicator: ${String(_exhaustive)}`)
    }
  }
}

export function ManagerPoolCard({
  period,
  pool,
  pacing,
  in_grace,
  grace_ends_at,
}: Props) {
  const remaining = Math.max(0, pool.remaining_amount_usd)
  const spent = pool.spent_amount_usd
  const allocated = pool.allocated_amount_usd
  const spentPct =
    allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0
  const chip = pacingChip(pacing)

  const graceDaysLeft =
    in_grace && grace_ends_at
      ? Math.max(
          0,
          Math.ceil(
            (grace_ends_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          )
        )
      : null

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            Your pool · {period.period_label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-novo-ink tabular">
            ${remaining.toLocaleString()}
          </p>
          <p className="text-xs text-novo-subtle">
            remaining of ${allocated.toLocaleString()}
          </p>
        </div>
        <PacingChip tone={chip.tone} label={chip.label} hint={chip.hint} />
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-novo-hover"
        aria-label={`${spentPct}% of pool spent`}
      >
        <div
          className="h-full rounded-full bg-novo-ink transition-all"
          style={{ width: `${spentPct}%` }}
        />
      </div>
      <p className="mt-2 text-2xs text-novo-muted tabular">
        ${spent.toLocaleString()} used · {spentPct}%
      </p>

      {graceDaysLeft !== null && (
        <p className="mt-4 rounded-md border border-novo-border bg-novo-hover px-3 py-2 text-xs text-novo-subtle">
          <span className="font-medium text-novo-ink">
            {period.period_label} has closed.
          </span>{' '}
          {graceDaysLeft === 0
            ? 'Finish pending reward selections today.'
            : `${graceDaysLeft} day${graceDaysLeft === 1 ? '' : 's'} left to finish pending reward selections.`}
        </p>
      )}
    </Card>
  )
}

function PacingChip({
  // tone is retained on the type so callers don't have to change, but
  // visually we render every state with the same neutral treatment.
  // The label itself ("On track" / "Running hot" / "Under-utilized")
  // already carries the meaning, and the bright green / amber chips
  // were dominating the otherwise quiet pool card.
  tone: _tone,
  label,
  hint,
}: {
  tone: 'positive' | 'warning' | 'neutral'
  label: string
  hint: string
}) {
  return (
    <span
      title={hint}
      className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-medium text-neutral-700"
    >
      {label}
    </span>
  )
}

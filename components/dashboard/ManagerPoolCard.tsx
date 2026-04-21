import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import { pacingCopy } from '@/modules/dashboard/manager-view'

interface Props {
  period: BudgetPeriodRecord
  pool: BudgetPoolRecord
  pacing: PacingIndicator
}

export function ManagerPoolCard({ period, pool, pacing }: Props) {
  const remaining = Math.max(0, pool.remaining_amount_usd)
  const spent = pool.spent_amount_usd
  const allocated = pool.allocated_amount_usd
  const reserved = pool.reserved_amount_usd
  const spentPct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0
  const chip = pacingCopy(pacing)

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500">Your recognition pool</h2>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            ${remaining.toLocaleString()} remaining
          </p>
          <p className="text-xs text-gray-500">
            of ${allocated.toLocaleString()} for {period.period_label}
          </p>
        </div>
        <span
          className={
            'rounded-full px-3 py-1 text-xs font-medium ' +
            (chip.tone === 'green'
              ? 'bg-green-50 text-green-700'
              : chip.tone === 'amber'
              ? 'bg-amber-50 text-amber-800'
              : 'bg-gray-100 text-gray-600')
          }
          title={chip.hint}
        >
          {chip.label}
        </span>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-gray-900 transition-all"
          style={{ width: `${spentPct}%` }}
          aria-label={`${spentPct}% of pool spent`}
        />
      </div>
      <p className="text-xs text-gray-500">
        ${spent.toLocaleString()} used
        {reserved > 0 ? ` · $${reserved.toLocaleString()} committed` : ''}
      </p>
      <p className="mt-3 text-xs text-gray-500">{chip.hint}</p>
    </section>
  )
}

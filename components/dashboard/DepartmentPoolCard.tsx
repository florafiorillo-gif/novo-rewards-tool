import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import type { Geo } from '@/modules/employees/types'

interface Props {
  department: string
  geo: Geo
  period: BudgetPeriodRecord
  pool: BudgetPoolRecord
  pacing: PacingIndicator
  in_grace?: boolean
  grace_ends_at?: Date | null
}

// Mirrors ManagerPoolCard's tone palette intentionally — dept heads and
// managers share the same mental model (remaining / pacing chip / bar).
// Keeping a parallel component rather than a shared one for now: copy
// differs, and a 7C/7D pass on People-team and committee cards will tell
// us whether a shared PoolCard primitive is worth extracting.
function pacingChip(p: PacingIndicator): {
  label: string
  tone: 'green' | 'amber' | 'gray'
  hint: string
} {
  switch (p) {
    case 'on_track':
      return { label: 'On track', tone: 'green', hint: 'Pacing matches the quarter.' }
    case 'running_hot':
      return {
        label: 'Running hot',
        tone: 'amber',
        hint: 'Spending ahead of pace — worth a look before quarter-end.',
      }
    case 'under_utilized':
      return {
        label: 'Under-utilized',
        tone: 'gray',
        hint: 'There is room to recognize more this quarter.',
      }
    default: {
      const _exhaustive: never = p
      throw new Error(`unknown pacing indicator: ${String(_exhaustive)}`)
    }
  }
}

export function DepartmentPoolCard({
  department,
  geo,
  period,
  pool,
  pacing,
  in_grace,
  grace_ends_at,
}: Props) {
  const remaining = Math.max(0, pool.remaining_amount_usd)
  const spent = pool.spent_amount_usd
  const allocated = pool.allocated_amount_usd
  const spentPct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0
  const chip = pacingChip(pacing)

  const graceDaysLeft =
    in_grace && grace_ends_at
      ? Math.max(
          0,
          Math.ceil((grace_ends_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        )
      : null

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500">
            {department} ({geo}) recognition pool
          </h2>
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
      <p className="text-xs text-gray-500">${spent.toLocaleString()} used</p>
      <p className="mt-3 text-xs text-gray-500">{chip.hint}</p>

      {graceDaysLeft !== null && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {period.period_label} has closed —{' '}
          {graceDaysLeft === 0
            ? 'the last day to finish pending reward selections is today.'
            : `${graceDaysLeft} day${graceDaysLeft === 1 ? '' : 's'} left to finish pending reward selections.`}
        </p>
      )}
    </section>
  )
}

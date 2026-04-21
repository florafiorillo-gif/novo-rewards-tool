import type { ManagerPoolSummary } from '@/modules/dashboard/department-view'
import type { PacingIndicator } from '@/modules/budget/types'

interface Props {
  items: ManagerPoolSummary[]
}

// Compact per-manager rows for the dept-head view (spec §10.5 "their
// managers' Tier 1 pool states on demand"). No amount breakdown below
// the dept head's own pool card — the purpose is cross-manager pattern
// visibility within the dept, not per-manager drill-down. Tier is kept
// out of the copy (spec §2 principle 1).
function chipStyle(p: PacingIndicator): { tone: string; label: string } {
  switch (p) {
    case 'on_track':
      return { tone: 'bg-green-50 text-green-700', label: 'On track' }
    case 'running_hot':
      return { tone: 'bg-amber-50 text-amber-800', label: 'Running hot' }
    case 'under_utilized':
      return { tone: 'bg-gray-100 text-gray-600', label: 'Under-utilized' }
    default: {
      const _exhaustive: never = p
      throw new Error(`unknown pacing indicator: ${String(_exhaustive)}`)
    }
  }
}

export function DepartmentManagerList({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500">
        No manager pools in your department yet this quarter.
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-gray-500">
        Manager pools in your department
      </h2>
      <ul className="space-y-3">
        {items.map(({ manager, pool, pacing }) => {
          const remaining = Math.max(0, pool.remaining_amount_usd)
          const allocated = pool.allocated_amount_usd
          const spentPct =
            allocated > 0
              ? Math.min(100, Math.round((pool.spent_amount_usd / allocated) * 100))
              : 0
          const chip = chipStyle(pacing)
          return (
            <li
              key={pool.id}
              className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {manager.name}
                </p>
                <p className="text-xs text-gray-500">
                  ${remaining.toLocaleString()} of $
                  {allocated.toLocaleString()} remaining
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-gray-900 transition-all"
                    style={{ width: `${spentPct}%` }}
                    aria-label={`${spentPct}% of pool spent`}
                  />
                </div>
              </div>
              <span
                className={'rounded-full px-3 py-1 text-xs font-medium ' + chip.tone}
              >
                {chip.label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

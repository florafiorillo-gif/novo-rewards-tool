import type { GeoPoolGroup } from '@/modules/dashboard/people-team-view'
import type { PacingIndicator } from '@/modules/budget/types'

interface Props {
  group: GeoPoolGroup
}

// Rendered for each of the three geos (US / India / Colombia) on the
// People Ops dashboard. Tier language stays out of section headers per
// spec §2 principle 1; section names describe who owns the pool rather
// than the tier label (e.g. "manager pools" not "Tier 1 manager pools").
function chip(p: PacingIndicator): { tone: string; label: string } {
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

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function GeoPoolsCard({ group }: Props) {
  const c = chip(group.pacing)
  const spentPct =
    group.allocated_usd > 0
      ? Math.min(100, Math.round((group.spent_usd / group.allocated_usd) * 100))
      : 0

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500">{group.geo}</h2>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {fmt(group.remaining_usd)} remaining
          </p>
          <p className="text-xs text-gray-500">
            of {fmt(group.allocated_usd)} allocated · {fmt(group.spent_usd)} spent
          </p>
        </div>
        <span className={'rounded-full px-3 py-1 text-xs font-medium ' + c.tone}>
          {c.label}
        </span>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-gray-900"
          style={{ width: `${spentPct}%` }}
          aria-label={`${spentPct}% of ${group.geo} allocation spent`}
        />
      </div>

      {group.manager_tier1.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Manager pools
          </p>
          <ul className="space-y-1">
            {group.manager_tier1.map((mp) => (
              <li
                key={mp.pool.id}
                className="flex items-center justify-between gap-2 text-xs text-gray-700"
              >
                <span className="truncate">{mp.owner_name ?? mp.pool.owner_id}</span>
                <span className="text-gray-500">
                  {fmt(mp.pool.remaining_amount_usd)} / {fmt(mp.pool.allocated_amount_usd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {group.department_tier2.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Department pools
          </p>
          <ul className="space-y-1">
            {group.department_tier2.map((dp) => (
              <li
                key={dp.pool.id}
                className="flex items-center justify-between gap-2 text-xs text-gray-700"
              >
                <span className="truncate">{dp.pool.department}</span>
                <span className="text-gray-500">
                  {fmt(dp.pool.remaining_amount_usd)} / {fmt(dp.pool.allocated_amount_usd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {group.peer_tier1 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Peer recognition pool
          </p>
          <p className="text-xs text-gray-700">
            {fmt(group.peer_tier1.pool.remaining_amount_usd)} of{' '}
            {fmt(group.peer_tier1.pool.allocated_amount_usd)} remaining
          </p>
        </div>
      )}
    </section>
  )
}

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isCommitteeMember, getCommitteeMembers } from '@/modules/roles/service'
import { getEmployeesByIds } from '@/modules/employees/service'
import { getPeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { DEFAULT_ALLOCATION_CONFIG } from '@/modules/budget/types'
import {
  activatePeriodAction,
  allocatePoolsAction,
  approvePeriodAction,
  closePeriodAction,
} from '../actions'

export const dynamic = 'force-dynamic'

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default async function BudgetPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isCommitteeMember(employeeId))) notFound()

  const { id } = await params
  const period = await getPeriod(id)
  if (!period) notFound()

  const pools = await listPoolsForPeriod(period.id)
  const committee = await getCommitteeMembers()
  const approvers = committee.filter((c) => period.approved_by.includes(c.id))
  const waitingOn = committee.filter((c) => !period.approved_by.includes(c.id))
  const ownerIds = pools.map((p) => p.owner_id).filter((x): x is string => !!x)
  const ownersById = await getEmployeesByIds(ownerIds)
  const config = period.allocation_config ?? DEFAULT_ALLOCATION_CONFIG

  const poolsByType = {
    committee_tier3: pools.find((p) => p.pool_type === 'committee_tier3') ?? null,
    reserve: pools.find((p) => p.pool_type === 'reserve') ?? null,
    peer_tier1: pools.filter((p) => p.pool_type === 'peer_tier1'),
    manager_tier1: pools.filter((p) => p.pool_type === 'manager_tier1'),
    department_tier2: pools.filter((p) => p.pool_type === 'department_tier2'),
  }

  const canAllocate = period.status === 'draft'
  const canApprove = period.status === 'draft' && !period.approved_by.includes(employeeId)
  const canActivate = period.status === 'approved'
  const canClose = period.status === 'active' || period.status === 'approved'

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-6">
        <Link href="/committee/budget" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to periods
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-gray-900">{period.period_label}</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {period.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {period.start_date.toLocaleDateString()} → {period.end_date.toLocaleDateString()}{' '}
          · total {fmtUsd(period.total_allocation_usd)}
        </p>
        {period.closed_at && (
          <p className="mt-1 text-xs text-gray-500">
            Closed {period.closed_at.toLocaleDateString()}. Pools stay drawable
            for 14 days for in-flight approvals.
          </p>
        )}
      </header>

      {/* Approval status */}
      <section className="mb-6 rounded-md border border-gray-200 p-4 text-sm text-gray-700">
        <p className="font-medium text-gray-900">Committee sign-off</p>
        <p className="mt-1 text-xs">
          Approved: {approvers.map((a) => a.name).join(', ') || '—'}
        </p>
        {waitingOn.length > 0 && (
          <p className="text-xs text-gray-500">
            Waiting on: {waitingOn.map((a) => a.name).join(', ')}
          </p>
        )}
      </section>

      {/* Allocation preview / config */}
      <section className="mb-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
        <p className="font-medium text-gray-900">Allocation split</p>
        <p className="mt-1">
          Tier 3: {config.tier3_pct}% · Reserve: {config.reserve_pct}% · Within
          geo — Manager T1: {config.within_geo.manager_tier1_pct}% / Peer T1:{' '}
          {config.within_geo.peer_tier1_pct}% / Dept T2:{' '}
          {config.within_geo.dept_tier2_pct}%
        </p>
      </section>

      {/* Pools */}
      {pools.length > 0 ? (
        <section className="mb-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Pools
          </h2>
          {poolsByType.reserve && (
            <PoolRow label="Reserve" pool={poolsByType.reserve} period={period} />
          )}
          {poolsByType.committee_tier3 && (
            <PoolRow
              label="Tier 3 · Committee"
              pool={poolsByType.committee_tier3}
              period={period}
            />
          )}
          {poolsByType.peer_tier1.map((p) => (
            <PoolRow
              key={p.id}
              label={`Peer Tier 1 · ${p.geo}`}
              pool={p}
              period={period}
            />
          ))}
          {poolsByType.manager_tier1.map((p) => (
            <PoolRow
              key={p.id}
              label={`Manager Tier 1 · ${
                ownersById.get(p.owner_id ?? '')?.name ?? p.owner_id
              }`}
              pool={p}
              period={period}
            />
          ))}
          {poolsByType.department_tier2.map((p) => (
            <PoolRow
              key={p.id}
              label={`Dept Tier 2 · ${p.department} · ${p.geo}`}
              pool={p}
              period={period}
            />
          ))}
        </section>
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          No pools allocated yet. Run the allocation below.
        </p>
      )}

      {/* Actions */}
      <section className="flex flex-wrap gap-3">
        {canAllocate && (
          <form action={allocatePoolsAction}>
            <input type="hidden" name="period_id" value={period.id} />
            <input type="hidden" name="tier3_pct" value={config.tier3_pct} />
            <input type="hidden" name="reserve_pct" value={config.reserve_pct} />
            <input
              type="hidden"
              name="manager_tier1_pct"
              value={config.within_geo.manager_tier1_pct}
            />
            <input
              type="hidden"
              name="peer_tier1_pct"
              value={config.within_geo.peer_tier1_pct}
            />
            <input
              type="hidden"
              name="dept_tier2_pct"
              value={config.within_geo.dept_tier2_pct}
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {pools.length > 0 ? 'Re-allocate pools' : 'Allocate pools'}
            </button>
          </form>
        )}
        {canApprove && (
          <form action={approvePeriodAction}>
            <input type="hidden" name="period_id" value={period.id} />
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Approve
            </button>
          </form>
        )}
        {canActivate && (
          <form action={activatePeriodAction}>
            <input type="hidden" name="period_id" value={period.id} />
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Activate
            </button>
          </form>
        )}
        {canClose && (
          <form action={closePeriodAction}>
            <input type="hidden" name="period_id" value={period.id} />
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

function PoolRow({
  label,
  pool,
  period,
}: {
  label: string
  pool: Parameters<typeof computePacing>[0]['pool']
  period: Parameters<typeof computePacing>[0]['period']
}) {
  const pacing = computePacing({ pool, period })
  return (
    <div className="flex items-baseline justify-between rounded-md border border-gray-200 p-3 text-sm">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">
          {fmtUsd(pool.remaining_amount_usd)} remaining of{' '}
          {fmtUsd(pool.allocated_amount_usd)}
        </p>
      </div>
      <span
        className={
          'rounded-full px-2 py-0.5 text-xs ' +
          (pacing === 'running_hot'
            ? 'bg-amber-100 text-amber-800'
            : pacing === 'under_utilized'
            ? 'bg-gray-100 text-gray-600'
            : 'bg-green-100 text-green-800')
        }
      >
        {pacing.replace('_', ' ')}
      </span>
    </div>
  )
}

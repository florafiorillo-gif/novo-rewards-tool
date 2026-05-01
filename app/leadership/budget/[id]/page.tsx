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
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { SubmitButton } from '@/components/ui/SubmitButton'

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
  const canApprove =
    period.status === 'draft' && !period.approved_by.includes(employeeId)
  const canActivate = period.status === 'approved'
  const canClose = period.status === 'active' || period.status === 'approved'

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/leadership/budget', label: 'Budget periods' }}
        title={period.period_label}
        description={
          <>
            <span className="tabular">
              {period.start_date.toLocaleDateString()} →{' '}
              {period.end_date.toLocaleDateString()}
            </span>{' '}
            · total {fmtUsd(period.total_allocation_usd)}
            {period.closed_at && (
              <>
                {' · '}Closed {period.closed_at.toLocaleDateString()}; pools stay
                drawable for 14 days.
              </>
            )}
          </>
        }
        actions={<StatusPill status={period.status} />}
      />

      <div className="space-y-6">
        {/* Signoff */}
        <Card>
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            Committee sign-off
          </p>
          <p className="mt-2 text-sm text-novo-ink">
            Approved: {approvers.map((a) => a.name).join(', ') || '—'}
          </p>
          {waitingOn.length > 0 && (
            <p className="mt-0.5 text-xs text-novo-subtle">
              Waiting on: {waitingOn.map((a) => a.name).join(', ')}
            </p>
          )}
        </Card>

        {/* Allocation config */}
        <Card>
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            Allocation split
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
            <ConfigRow label="Tier 3" value={`${config.tier3_pct}%`} />
            <ConfigRow label="Reserve" value={`${config.reserve_pct}%`} />
            <ConfigRow
              label="Manager T1"
              value={`${config.within_geo.manager_tier1_pct}%`}
            />
            <ConfigRow
              label="Peer T1"
              value={`${config.within_geo.peer_tier1_pct}%`}
            />
            <ConfigRow
              label="Dept T2"
              value={`${config.within_geo.dept_tier2_pct}%`}
            />
          </dl>
        </Card>

        {/* Pools */}
        {pools.length > 0 ? (
          <section>
            <h2 className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Pools
            </h2>
            <div className="space-y-2">
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
            </div>
          </section>
        ) : (
          <Card className="text-center">
            <p className="text-sm text-novo-subtle">
              No pools allocated yet. Run the allocation below.
            </p>
          </Card>
        )}

        {/* Actions */}
        <section className="flex flex-wrap gap-3 border-t border-novo-border pt-6">
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
              <SubmitButton
                pendingLabel={
                  pools.length > 0 ? 'Re-allocating…' : 'Allocating…'
                }
              >
                {pools.length > 0 ? 'Re-allocate pools' : 'Allocate pools'}
              </SubmitButton>
            </form>
          )}
          {canApprove && (
            <form action={approvePeriodAction}>
              <input type="hidden" name="period_id" value={period.id} />
              <SubmitButton variant="secondary" pendingLabel="Approving…">
                Approve
              </SubmitButton>
            </form>
          )}
          {canActivate && (
            <form action={activatePeriodAction}>
              <input type="hidden" name="period_id" value={period.id} />
              <SubmitButton variant="secondary" pendingLabel="Activating…">
                Activate
              </SubmitButton>
            </form>
          )}
          {canClose && (
            <form action={closePeriodAction}>
              <input type="hidden" name="period_id" value={period.id} />
              <SubmitButton variant="secondary" pendingLabel="Closing…">
                Close
              </SubmitButton>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === 'approved'
        ? 'border-sky-200 bg-sky-50 text-sky-800'
        : status === 'closed'
          ? 'border-novo-border bg-novo-hover text-novo-subtle'
          : 'border-amber-200 bg-amber-50 text-amber-800'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-2xs font-medium uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-[0.08em] text-novo-muted">
        {label}
      </dt>
      <dd className="text-sm font-medium text-novo-ink tabular">{value}</dd>
    </div>
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
  const pct =
    pool.allocated_amount_usd > 0
      ? Math.min(
          100,
          Math.round((pool.spent_amount_usd / pool.allocated_amount_usd) * 100)
        )
      : 0
  const tone =
    pacing === 'running_hot'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : pacing === 'under_utilized'
        ? 'border-novo-border bg-novo-hover text-novo-subtle'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return (
    <div className="flex items-center justify-between rounded-lg border border-novo-border bg-novo-elevated px-4 py-3 shadow-card">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-novo-ink">{label}</p>
        <p className="mt-0.5 text-xs text-novo-subtle tabular">
          {fmtUsd(pool.remaining_amount_usd)} of{' '}
          {fmtUsd(pool.allocated_amount_usd)} remaining ·{' '}
          <span className="text-novo-muted">{pct}% spent</span>
        </p>
      </div>
      <span
        className={`ml-4 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-medium ${tone}`}
      >
        {pacing.replace('_', ' ')}
      </span>
    </div>
  )
}

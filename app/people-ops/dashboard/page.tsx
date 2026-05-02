import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getPeopleTeamDashboardView } from '@/modules/dashboard/people-team-view'
import { GeoPoolsCard } from '@/components/dashboard/GeoPoolsCard'
import { ProgramExceptionsList } from '@/components/dashboard/ProgramExceptionsList'
import { SlaMissesList } from '@/components/dashboard/SlaMissesList'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export default async function PeopleOpsDashboardPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const view = await getPeopleTeamDashboardView(employeeId)
  if (!view.authorized) notFound()

  return (
    <main className="mx-auto max-w-shell px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/people-ops', label: 'People Ops' }}
        title="Program dashboard"
        description={
          view.period
            ? `${view.period.period_label}. Full program view.`
            : 'No active recognition period right now.'
        }
      />

      {view.in_grace && view.grace_ends_at && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-medium">
            {view.period?.period_label} has closed.
          </span>{' '}
          Pools stay drawable until {view.grace_ends_at.toLocaleDateString()}.
        </div>
      )}

      {!view.period && <EmptyState title="No active period." />}

      {view.period && (
        <div className="space-y-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {view.tier3_pool && (
              <StatCard
                label="Committee pool"
                primary={fmt(view.tier3_pool.pool.remaining_amount_usd)}
                secondary={`of ${fmt(view.tier3_pool.pool.allocated_amount_usd)} · ${fmt(view.tier3_pool.pool.spent_amount_usd)} spent`}
              />
            )}
            {view.reserve && (
              <StatCard
                label="Reserve pool"
                primary={fmt(view.reserve.pool.remaining_amount_usd)}
                secondary={`of ${fmt(view.reserve.pool.allocated_amount_usd)} · ${fmt(view.reserve.pool.spent_amount_usd)} drawn`}
              />
            )}
          </section>

          <section>
            <h2 className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Pools by geo
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {view.pools_by_geo.map((group) => (
                <GeoPoolsCard key={group.geo} group={group} />
              ))}
            </div>
          </section>

          <ProgramExceptionsList items={view.exceptions} />
          <SlaMissesList items={view.sla_misses} />
        </div>
      )}
    </main>
  )
}

function StatCard({
  label,
  primary,
  secondary,
}: {
  label: string
  primary: string
  secondary: string
}) {
  return (
    <Card padded={false} className="p-5">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-novo-ink tabular">
        {primary}
      </p>
      <p className="mt-0.5 text-xs text-novo-subtle">{secondary}</p>
    </Card>
  )
}

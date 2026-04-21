import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getPeopleTeamDashboardView } from '@/modules/dashboard/people-team-view'
import { GeoPoolsCard } from '@/components/dashboard/GeoPoolsCard'
import { ProgramExceptionsList } from '@/components/dashboard/ProgramExceptionsList'
import { SlaMissesList } from '@/components/dashboard/SlaMissesList'

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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Program dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {view.period
            ? `${view.period.period_label} — full program view.`
            : 'No active recognition period right now.'}
        </p>
        {view.in_grace && view.grace_ends_at && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {view.period?.period_label} has closed — pools stay drawable until{' '}
            {view.grace_ends_at.toLocaleDateString()}.
          </p>
        )}
      </header>

      {view.period && (
        <div className="space-y-6">
          {view.tier3_pool && (
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-500">Committee pool</h2>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {fmt(view.tier3_pool.pool.remaining_amount_usd)} remaining
              </p>
              <p className="text-xs text-gray-500">
                of {fmt(view.tier3_pool.pool.allocated_amount_usd)} ·{' '}
                {fmt(view.tier3_pool.pool.spent_amount_usd)} spent
              </p>
            </section>
          )}

          {view.reserve && (
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-500">Reserve pool</h2>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {fmt(view.reserve.pool.remaining_amount_usd)} remaining
              </p>
              <p className="text-xs text-gray-500">
                of {fmt(view.reserve.pool.allocated_amount_usd)} ·{' '}
                {fmt(view.reserve.pool.spent_amount_usd)} drawn
              </p>
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {view.pools_by_geo.map((group) => (
              <GeoPoolsCard key={group.geo} group={group} />
            ))}
          </div>

          <ProgramExceptionsList items={view.exceptions} />
          <SlaMissesList items={view.sla_misses} />
        </div>
      )}
    </main>
  )
}

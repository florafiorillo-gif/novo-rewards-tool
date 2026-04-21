import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'

export const dynamic = 'force-dynamic'

export default async function PeopleOpsHomePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">People Ops</h1>
        <p className="mt-1 text-sm text-gray-500">
          Catalog + scope note maintenance. Manual fulfillment queue lands in
          Phase 5 Commit E.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/people-ops/dashboard"
          className="rounded-lg border border-gray-200 bg-white p-6 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-900">Program dashboard</p>
          <p className="mt-1 text-xs text-gray-500">
            Pools by geo, reserve draws, SLA misses for the current quarter.
          </p>
        </Link>
        <Link
          href="/people-ops/fulfillment"
          className="rounded-lg border border-gray-200 bg-white p-6 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-900">Fulfillment queue</p>
          <p className="mt-1 text-xs text-gray-500">
            Manual sourcing + cash batches + failed rewards.
          </p>
        </Link>
        <Link
          href="/people-ops/catalog"
          className="rounded-lg border border-gray-200 bg-white p-6 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-900">Catalog</p>
          <p className="mt-1 text-xs text-gray-500">
            Reward options per geo. Approvers pick from here at selection time.
          </p>
        </Link>
        <Link
          href="/people-ops/scope-notes"
          className="rounded-lg border border-gray-200 bg-white p-6 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-900">Scope notes</p>
          <p className="mt-1 text-xs text-gray-500">
            Templates approvers attach to rewards. One per tier, editable.
          </p>
        </Link>
      </div>
    </main>
  )
}

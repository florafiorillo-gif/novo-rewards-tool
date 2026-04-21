import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { isCommitteeMember, isPeopleTeamRep } from '@/modules/roles/service'
import { getManagerDashboardView } from '@/modules/dashboard/manager-view'
import { getDepartmentDashboardView } from '@/modules/dashboard/department-view'
import { ManagerPoolCard } from '@/components/dashboard/ManagerPoolCard'
import { RecentRecognitions } from '@/components/dashboard/RecentRecognitions'
import { DepartmentPoolCard } from '@/components/dashboard/DepartmentPoolCard'
import { DepartmentManagerList } from '@/components/dashboard/DepartmentManagerList'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const employeeId = session.user.employeeId
  if (!employeeId) redirect('/auth/signin')

  const [view, deptView, isCommittee, isPeopleOps] = await Promise.all([
    getManagerDashboardView(employeeId),
    getDepartmentDashboardView(employeeId),
    isCommitteeMember(employeeId),
    isPeopleTeamRep(employeeId),
  ])

  const { period, in_grace, grace_ends_at, pool, pacing, pending_tier1_count, recent } = view

  const isDeptHead = deptView.department !== null
  // Use the manager-view period as the primary header anchor; dept view
  // resolves the same period, so they agree. If a dept head is not also a
  // manager, deptView.period carries the label.
  const headerPeriod = period ?? deptView.period

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome, {session.user.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {headerPeriod
            ? `${headerPeriod.period_label} — recognition snapshot.`
            : 'No active recognition period right now.'}
        </p>
      </header>

      <div className="space-y-6">
        {pool && period && pacing && (
          <ManagerPoolCard
            period={period}
            pool={pool}
            pacing={pacing}
            in_grace={in_grace}
            grace_ends_at={grace_ends_at}
          />
        )}

        {pending_tier1_count > 0 && (
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium text-gray-500">Waiting on you</h2>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {pending_tier1_count} nomination{pending_tier1_count === 1 ? '' : 's'} to review
                </p>
              </div>
              <Link
                href="/approvals/queue"
                className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Review
              </Link>
            </div>
          </section>
        )}

        {(pool || recent.length > 0) && <RecentRecognitions items={recent} />}

        {isDeptHead &&
          deptView.dept_pool &&
          deptView.dept_pacing &&
          deptView.period &&
          deptView.department &&
          deptView.geo && (
            <DepartmentPoolCard
              department={deptView.department}
              geo={deptView.geo}
              period={deptView.period}
              pool={deptView.dept_pool}
              pacing={deptView.dept_pacing}
              in_grace={deptView.in_grace}
              grace_ends_at={deptView.grace_ends_at}
            />
          )}

        {isDeptHead && deptView.pending_tier2_count > 0 && (
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium text-gray-500">
                  Waiting on your department sign-off
                </h2>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {deptView.pending_tier2_count} nomination
                  {deptView.pending_tier2_count === 1 ? '' : 's'} to review
                </p>
              </div>
              <Link
                href="/approvals/queue"
                className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Review
              </Link>
            </div>
          </section>
        )}

        {isDeptHead && deptView.period && (
          <DepartmentManagerList items={deptView.manager_pools} />
        )}

        <section className="flex flex-wrap gap-3">
          <Link
            href="/nominations/new"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
          >
            Recognize a teammate
          </Link>
          {pending_tier1_count === 0 && deptView.pending_tier2_count === 0 && (
            <Link
              href="/approvals/queue"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Review nominations
            </Link>
          )}
          {isCommittee && (
            <>
              <Link
                href="/committee/queue"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Committee queue
              </Link>
              <Link
                href="/committee/budget"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Budget
              </Link>
            </>
          )}
          {isPeopleOps && (
            <Link
              href="/people-ops"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              People Ops
            </Link>
          )}
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Settings
          </Link>
        </section>
      </div>
    </main>
  )
}

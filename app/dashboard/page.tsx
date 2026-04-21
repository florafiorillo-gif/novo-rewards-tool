import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { isCommitteeMember, isPeopleTeamRep } from '@/modules/roles/service'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const isCommittee = session.user.employeeId
    ? await isCommitteeMember(session.user.employeeId)
    : false
  const isPeopleOps = session.user.employeeId
    ? await isPeopleTeamRep(session.user.employeeId)
    : false

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome, {session.user.name}
      </h1>
      <p className="mt-2 text-gray-500">Dashboard coming in Phase 7.</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/nominations/new"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
        >
          Recognize a teammate
        </Link>
        <Link
          href="/approvals/queue"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          Review nominations
        </Link>
        {isCommittee && (
          <>
            <Link
              href="/committee/queue"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Committee queue
            </Link>
            <Link
              href="/committee/budget"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Budget
            </Link>
          </>
        )}
        {isPeopleOps && (
          <Link
            href="/people-ops"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            People Ops
          </Link>
        )}
      </div>
    </main>
  )
}

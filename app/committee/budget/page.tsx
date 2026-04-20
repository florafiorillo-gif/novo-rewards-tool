import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isCommitteeMember } from '@/modules/roles/service'
import { listPeriods } from '@/modules/budget/periods'

export const dynamic = 'force-dynamic'

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default async function BudgetPeriodsPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isCommitteeMember(employeeId))) notFound()

  const periods = await listPeriods()

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Budget periods</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quarterly allocations. Committee sign-off required before a period
            becomes active.
          </p>
        </div>
        <Link
          href="/committee/budget/new"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
        >
          New period
        </Link>
      </header>

      <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {periods.length === 0 && (
          <p className="p-6 text-sm text-gray-500">
            No periods yet. Start with a new quarterly allocation.
          </p>
        )}
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`/committee/budget/${p.id}`}
            className="block p-6 transition hover:bg-gray-50"
          >
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-gray-900">{p.period_label}</p>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs ' +
                  (p.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : p.status === 'approved'
                    ? 'bg-blue-100 text-blue-800'
                    : p.status === 'closed'
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-amber-100 text-amber-800')
                }
              >
                {p.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {p.start_date.toLocaleDateString()} → {p.end_date.toLocaleDateString()}{' '}
              · total {fmtUsd(p.total_allocation_usd)}
            </p>
          </Link>
        ))}
      </div>
    </main>
  )
}

import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isCommitteeMember } from '@/modules/roles/service'
import { listPeriods } from '@/modules/budget/periods'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/Button'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

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
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/leadership/dashboard', label: 'Leadership dashboard' }}
        title="Budget periods"
        description="Quarterly allocations. Leadership sign-off required before a period becomes active."
        actions={
          <LinkButton href="/leadership/budget/new" variant="primary">
            New period
          </LinkButton>
        }
      />

      {periods.length === 0 ? (
        <EmptyState
          title="No periods yet"
          description="Periods are the container for all pools and nominations in a quarter. Start with a new allocation."
          action={
            <LinkButton href="/leadership/budget/new" variant="primary">
              Create first period
            </LinkButton>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-novo-border bg-novo-surface/60 text-left text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
                <th className="px-5 py-2.5">Label</th>
                <th className="px-5 py-2.5">Dates</th>
                <th className="px-5 py-2.5 text-right">Total</th>
                <th className="px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-novo-border">
              {periods.map((p) => (
                <tr
                  key={p.id}
                  className="group transition hover:bg-novo-hover/50"
                >
                  <td className="px-5 py-4">
                    <KeepViewLink
                      href={`/leadership/budget/${p.id}`}
                      className="font-medium text-novo-ink group-hover:underline"
                    >
                      {p.period_label}
                    </KeepViewLink>
                  </td>
                  <td className="px-5 py-4 text-novo-subtle tabular">
                    {p.start_date.toLocaleDateString()} →{' '}
                    {p.end_date.toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right text-novo-ink tabular">
                    {fmtUsd(p.total_allocation_usd)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium ${tone}`}
    >
      {status}
    </span>
  )
}

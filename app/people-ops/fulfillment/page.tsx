import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listManualFulfillmentQueue } from '@/modules/fulfillment/queries'
import {
  markDeliveredAction,
  markFailedAction,
  markIssuedAction,
} from './actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default async function FulfillmentQueuePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  const items = await listManualFulfillmentQueue()

  const colombia = items.filter((i) => i.nominee.geo === 'Colombia')
  const usCashPending = items.filter(
    (i) =>
      i.reward.delivery_mechanism === 'justworks_csv' &&
      (i.reward.status === 'selected' || i.reward.status === 'issued')
  )
  const indiaCash = items.filter(
    (i) => i.reward.delivery_mechanism === 'zoho_payroll'
  )
  const custom = items.filter(
    (i) => i.reward.reward_type === 'custom' && i.nominee.geo !== 'Colombia'
  )
  const failed = items.filter((i) => i.reward.status === 'failed')

  return (
    <main className="mx-auto max-w-shell px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/people-ops', label: 'People Ops' }}
        title="Manual fulfillment"
        description={
          items.length === 0
            ? 'Nothing waiting.'
            : `${items.length} reward${items.length === 1 ? '' : 's'} needing People Ops action.`
        }
      />

      {items.length === 0 ? (
        <EmptyState title="Queue is clear" />
      ) : (
        <div className="space-y-8">
          {usCashPending.length > 0 && (
            <QueueSection
              title="US cash · JustWorks batch"
              count={usCashPending.length}
              action={
                <Link
                  href="/api/people-ops/exports/justworks-cash"
                  className="text-xs text-novo-ink underline underline-offset-2 hover:opacity-80"
                >
                  Download CSV
                </Link>
              }
            >
              <Group items={usCashPending} />
            </QueueSection>
          )}
          {indiaCash.length > 0 && (
            <QueueSection
              title="India cash · Zoho payroll"
              count={indiaCash.length}
            >
              <Group items={indiaCash} showInstruction="zoho" />
            </QueueSection>
          )}
          {colombia.length > 0 && (
            <QueueSection title="Colombia · manual" count={colombia.length}>
              <Group items={colombia} showInstruction="colombia" />
            </QueueSection>
          )}
          {custom.length > 0 && (
            <QueueSection
              title="Custom rewards · manual sourcing"
              count={custom.length}
            >
              <Group items={custom} />
            </QueueSection>
          )}
          {failed.length > 0 && (
            <QueueSection
              title="Failed · needs People Ops attention"
              count={failed.length}
              tone="critical"
            >
              <Group items={failed} />
            </QueueSection>
          )}
        </div>
      )}
    </main>
  )
}

function QueueSection({
  title,
  count,
  action,
  tone,
  children,
}: {
  title: string
  count: number
  action?: React.ReactNode
  tone?: 'critical'
  children: React.ReactNode
}) {
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2
            className={`text-sm font-semibold ${
              tone === 'critical' ? 'text-novo-coral' : 'text-novo-ink'
            }`}
          >
            {title}
          </h2>
          <span className="text-2xs tabular text-novo-muted">{count}</span>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function Group({
  items,
  showInstruction,
}: {
  items: Awaited<ReturnType<typeof listManualFulfillmentQueue>>
  showInstruction?: 'zoho' | 'colombia'
}) {
  return (
    <div className="divide-y divide-novo-border rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      {items.map((item) => (
        <article key={item.reward.id} className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-novo-ink">
              {item.nominee.name}
              <span className="ml-2 text-xs font-normal text-novo-muted">
                {item.nominee.employment_type === 'contractor'
                  ? 'contractor'
                  : 'employee'}
                , {item.nominee.geo}
              </span>
            </p>
            <span className="inline-flex items-center rounded border border-novo-border bg-novo-surface px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-novo-subtle">
              {item.reward.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-novo-subtle">
            {item.reward.reward_type}
            {item.reward.vendor ? ` · ${item.reward.vendor}` : ''} ·{' '}
            <span className="tabular">{fmtUsd(item.reward.amount_usd)}</span>
          </p>
          <p className="mt-2 text-xs italic text-novo-subtle">
            &ldquo;{item.nomination.behavior_text.slice(0, 140)}
            {item.nomination.behavior_text.length > 140 ? '…' : ''}&rdquo;
          </p>
          {showInstruction === 'zoho' && (
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-novo-border bg-novo-hover p-3 text-2xs text-novo-subtle">
              {`Payee: ${item.nominee.name} (${item.nominee.email})
Employee ID: ${item.nominee.id}
Net to recipient: $${item.reward.amount_usd.toFixed(2)} USD
Reward ID: ${item.reward.id}
Nomination: ${item.reward.nomination_id}`}
            </pre>
          )}
          {showInstruction === 'colombia' && (
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-novo-border bg-novo-hover p-3 text-2xs text-novo-subtle">
              {`Payee: ${item.nominee.name} (${item.nominee.email})
Employee ID: ${item.nominee.id}
${
  item.nominee.employment_type === 'contractor'
    ? 'Contractor: contractor payment path (coordinate with Finance).'
    : 'Employee: Zoho payroll (coordinate with Finance).'
}
Reward: ${item.reward.reward_type} · $${item.reward.amount_usd.toFixed(2)} USD
Reward ID: ${item.reward.id}
Nomination: ${item.reward.nomination_id}`}
            </pre>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {item.reward.status === 'selected' && (
              <form action={markIssuedAction}>
                <input type="hidden" name="reward_id" value={item.reward.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Mark issued
                </Button>
              </form>
            )}
            {item.reward.status === 'issued' && (
              <form action={markDeliveredAction}>
                <input type="hidden" name="reward_id" value={item.reward.id} />
                <Button type="submit" size="sm">
                  Mark delivered
                </Button>
              </form>
            )}
            {(item.reward.status === 'selected' ||
              item.reward.status === 'issued') && (
              <details className="inline-block">
                <summary className="cursor-pointer rounded-md border border-novo-border bg-novo-paper px-3 py-1.5 text-xs text-novo-subtle hover:text-novo-ink">
                  Mark failed
                </summary>
                <form action={markFailedAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="reward_id" value={item.reward.id} />
                  <input
                    name="reason"
                    required
                    placeholder="Reason"
                    className="h-8 w-48 rounded-md border border-novo-border bg-novo-paper px-2 text-xs text-novo-ink focus:border-novo-ink"
                  />
                  <Button type="submit" variant="danger" size="sm">
                    Confirm fail
                  </Button>
                </form>
              </details>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

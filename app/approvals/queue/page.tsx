import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listPendingApprovalsForEmployee } from '@/modules/approvals/queries'
import { ApprovalCard } from '@/components/approvals/ApprovalCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function ApprovalsQueuePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const items = await listPendingApprovalsForEmployee(employeeId)

  const byAction = {
    approve: items.filter((i) => i.action_needed === 'approve'),
    select_reward: items.filter((i) => i.action_needed === 'select_reward'),
    confirm_reward: items.filter((i) => i.action_needed === 'confirm_reward'),
    wait: items.filter((i) => i.action_needed === 'wait'),
  }

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="Inbox"
        title="Nominations to review"
        description={
          items.length === 0
            ? 'Your queue is empty. We&rsquo;ll surface new work here as it arrives.'
            : `${items.length} waiting across the flows below.`
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing waiting on you"
          description="When a teammate submits a nomination that routes to you — or a reward you need to select or confirm — it'll show up here."
          action={
            <LinkButton href="/dashboard" variant="secondary">
              Back to dashboard
            </LinkButton>
          }
          footnote="Quiet inboxes are a feature. Notice someone instead."
        />
      ) : (
        <div className="space-y-10">
          <QueueSection
            title="Awaiting your approval"
            hint="Tier 1 & 2 reviews routed to you."
            items={byAction.approve}
            viewerEmployeeId={employeeId}
          />
          <QueueSection
            title="Pick a reward"
            hint="Already approved — choose the reward to finish."
            items={byAction.select_reward}
            viewerEmployeeId={employeeId}
          />
          <QueueSection
            title="Confirm the reward"
            hint="Dept head picked; your sign-off commits the budget."
            items={byAction.confirm_reward}
            viewerEmployeeId={employeeId}
          />
          <QueueSection
            title="Waiting on the other approver"
            hint="No action from you right now — here for visibility."
            items={byAction.wait}
            viewerEmployeeId={employeeId}
            muted
          />
        </div>
      )}
    </main>
  )
}

function QueueSection({
  title,
  hint,
  items,
  viewerEmployeeId,
  muted,
}: {
  title: string
  hint: string
  items: Awaited<ReturnType<typeof listPendingApprovalsForEmployee>>
  viewerEmployeeId: string
  muted?: boolean
}) {
  if (items.length === 0) return null
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h2
            className={`text-sm font-semibold ${
              muted ? 'text-novo-subtle' : 'text-novo-ink'
            }`}
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-novo-muted">{hint}</p>
        </div>
        <span className="text-2xs font-medium tabular text-novo-muted">
          {items.length}
        </span>
      </header>
      <div className="space-y-3">
        {items.map((item) => (
          <ApprovalCard
            key={item.nomination.id}
            hydrated={item}
            viewerEmployeeId={viewerEmployeeId}
          />
        ))}
      </div>
    </section>
  )
}

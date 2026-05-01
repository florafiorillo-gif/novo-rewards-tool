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
        title="Nominations to review"
        description={
          items.length === 0
            ? 'Your queue is empty.'
            : `${items.length} waiting.`
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing waiting on you"
          action={
            <LinkButton href="/dashboard" variant="secondary">
              Back to dashboard
            </LinkButton>
          }
        />
      ) : (
        // Visual hierarchy: primary decision work first (large,
        // ink-weighted), reward-side follow-ups in the middle at
        // standard weight, and "waiting on someone else" last as
        // a muted informational strip behind a divider. Sections
        // with zero items return null so empty buckets don't take
        // up space.
        <>
          <QueueSection
            variant="primary"
            title="Awaiting your approval"
            hint="Tier 1 & 2 reviews routed to you. These are the ones to clear first."
            items={byAction.approve}
            viewerEmployeeId={employeeId}
          />

          {(byAction.select_reward.length > 0 ||
            byAction.confirm_reward.length > 0) && (
            <div className="mt-12 space-y-10">
              <QueueSection
                variant="standard"
                title="Pick a reward"
                hint="Already approved. Choose the reward to finish the handoff."
                items={byAction.select_reward}
                viewerEmployeeId={employeeId}
              />
              <QueueSection
                variant="standard"
                title="Confirm the reward"
                hint="Dept head picked; your sign-off commits the budget."
                items={byAction.confirm_reward}
                viewerEmployeeId={employeeId}
              />
            </div>
          )}

          {byAction.wait.length > 0 && (
            <div className="mt-16 border-t border-novo-border pt-8">
              <QueueSection
                variant="muted"
                title="Waiting on the other approver"
                hint="No action from you. Here so you can see what's moving."
                items={byAction.wait}
                viewerEmployeeId={employeeId}
              />
            </div>
          )}
        </>
      )}
    </main>
  )
}

type SectionVariant = 'primary' | 'standard' | 'muted'

function QueueSection({
  variant,
  title,
  hint,
  items,
  viewerEmployeeId,
}: {
  variant: SectionVariant
  title: string
  hint: string
  items: Awaited<ReturnType<typeof listPendingApprovalsForEmployee>>
  viewerEmployeeId: string
}) {
  if (items.length === 0) return null

  const titleCls =
    variant === 'primary'
      ? 'text-xl font-semibold tracking-tight text-novo-ink'
      : variant === 'standard'
        ? 'text-base font-semibold text-novo-ink'
        : 'text-sm font-medium text-novo-subtle'

  const hintCls =
    variant === 'primary'
      ? 'mt-1 text-sm text-novo-subtle'
      : variant === 'standard'
        ? 'mt-0.5 text-xs text-novo-muted'
        : 'mt-0.5 text-2xs text-novo-muted'

  const cardGap = variant === 'primary' ? 'space-y-4' : 'space-y-3'

  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className={titleCls}>{title}</h2>
          <p className={hintCls}>{hint}</p>
        </div>
        <CountBadge count={items.length} variant={variant} />
      </header>
      <div className={cardGap}>
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

function CountBadge({
  count,
  variant,
}: {
  count: number
  variant: SectionVariant
}) {
  if (variant === 'primary') {
    return (
      <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-novo-ink px-2.5 text-xs font-semibold text-novo-paper tabular">
        {count}
      </span>
    )
  }
  if (variant === 'standard') {
    return (
      <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-novo-border bg-novo-surface px-2 text-2xs font-medium text-novo-subtle tabular">
        {count}
      </span>
    )
  }
  return (
    <span className="text-2xs font-medium tabular text-novo-muted">
      {count}
    </span>
  )
}

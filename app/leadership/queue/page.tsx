import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listCommitteeQueue } from '@/modules/committee/service'
import { isCommitteeMember } from '@/modules/roles/service'
import { listScopeNoteTemplates } from '@/modules/scope-notes/service'
import { CommitteeCard } from '@/components/committee/CommitteeCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function CommitteeQueuePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const allowed = await isCommitteeMember(employeeId)
  if (!allowed) notFound()

  const [items, scopeNoteRows] = await Promise.all([
    listCommitteeQueue(employeeId),
    listScopeNoteTemplates({ tier: 3, active_only: true }),
  ])
  const scopeNotes = scopeNoteRows.map((s) => ({
    id: s.id,
    template_text: s.template_text,
  }))

  const urgent = items.filter((i) => i.nomination.urgent)
  const regular = items.filter((i) => !i.nomination.urgent)

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/leadership/dashboard', label: 'Leadership dashboard' }}
        eyebrow="Leadership"
        title="Queue"
        description="Tier 3 nominations for joint review. Batched monthly; urgent items surface first."
      />

      {items.length === 0 ? (
        <EmptyState
          title="No Tier 3 nominations pending"
          description="Next review happens at the monthly cadence. Urgent items will jump the queue when they arrive."
          action={
            <LinkButton href="/leadership/dashboard" variant="secondary">
              Back to leadership dashboard
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-10">
          {urgent.length > 0 && (
            <QueueSection
              title="Urgent — async decision requested"
              hint="These don't wait for the monthly cadence."
              items={urgent}
              viewerEmployeeId={employeeId}
              scopeNotes={scopeNotes}
              urgent
            />
          )}
          {regular.length > 0 && (
            <QueueSection
              title="Scheduled for monthly review"
              hint="Leadership discusses at the next cadence."
              items={regular}
              viewerEmployeeId={employeeId}
              scopeNotes={scopeNotes}
            />
          )}
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
  scopeNotes,
  urgent,
}: {
  title: string
  hint: string
  items: Awaited<ReturnType<typeof listCommitteeQueue>>
  viewerEmployeeId: string
  scopeNotes: { id: string; template_text: string }[]
  urgent?: boolean
}) {
  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2
            className={`text-sm font-semibold ${
              urgent ? 'text-amber-900' : 'text-novo-ink'
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
      <div className="space-y-4">
        {items.map((item) => (
          <CommitteeCard
            key={item.nomination.id}
            item={item}
            viewerEmployeeId={viewerEmployeeId}
            scopeNotes={scopeNotes}
          />
        ))}
      </div>
    </section>
  )
}

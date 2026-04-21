import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listCommitteeQueue } from '@/modules/committee/service'
import { isCommitteeMember } from '@/modules/roles/service'
import { listScopeNoteTemplates } from '@/modules/scope-notes/service'
import { CommitteeCard } from '@/components/committee/CommitteeCard'

export const dynamic = 'force-dynamic'

// Spec §7.5 — Flora + Rares only. Anyone else gets 404 (not 403) to avoid
// leaking the existence of this surface.
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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Committee queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tier 3 nominations for joint review. Batched monthly; urgent items surface
          first.
        </p>
      </header>

      {urgent.length > 0 && (
        <section className="mb-10 space-y-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Urgent — async decision requested
          </h2>
          {urgent.map((item) => (
            <CommitteeCard
              key={item.nomination.id}
              item={item}
              viewerEmployeeId={employeeId}
              scopeNotes={scopeNotes}
            />
          ))}
        </section>
      )}

      <section className="space-y-4">
        {regular.length === 0 && urgent.length === 0 ? (
          <p className="text-sm text-gray-500">
            No Tier 3 nominations pending. Next review at the monthly cadence.
          </p>
        ) : regular.length === 0 ? null : (
          <>
            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Scheduled for monthly review
            </h2>
            {regular.map((item) => (
              <CommitteeCard
                key={item.nomination.id}
                item={item}
                viewerEmployeeId={employeeId}
                scopeNotes={scopeNotes}
              />
            ))}
          </>
        )}
      </section>
    </main>
  )
}

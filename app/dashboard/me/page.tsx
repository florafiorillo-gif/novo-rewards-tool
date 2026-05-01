import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getRecipientDashboardView } from '@/modules/dashboard/recipient-view'
import { RecipientRecognitionList } from '@/components/dashboard/RecipientRecognitionList'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

export const dynamic = 'force-dynamic'

// Personal recognition history. Spec §17 / Phase 7 "recipient web view" —
// tiers and dollars are stripped server-side in recipient-view.ts.
export default async function RecipientDashboardPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const view = await getRecipientDashboardView(employeeId)

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="Your recognitions"
        title="Noticed"
        description="What teammates have called out. Tiers and dollar amounts are kept private — this is about the story, not the size."
      />

      {view.items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="When a teammate recognizes you for living one of the values, it lands here. Visible only to you."
        />
      ) : (
        <RecipientRecognitionList items={view.items} />
      )}

      <p className="mt-10 text-center text-xs text-novo-muted">
        <KeepViewLink
          href="/settings"
          className="underline underline-offset-2 hover:text-novo-ink"
        >
          Recognition preferences
        </KeepViewLink>
      </p>
    </main>
  )
}

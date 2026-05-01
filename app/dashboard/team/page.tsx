import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isManager } from '@/modules/employees/service'
import { getTeamRecognitionsForQuarter } from '@/modules/dashboard/team-recognitions-view'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { TeamRecognitionsFeed } from '@/components/dashboard/TeamRecognitionsFeed'
import { TeamExportButton } from '@/components/dashboard/TeamExportButton'

export const dynamic = 'force-dynamic'

// Conversation-starter feed of recognitions received by the manager's
// direct reports during the current calendar quarter, grouped by
// recipient. Read-only — the global "+ Recognize" pill in AppHeader is
// the only entry to the recognition flow from this page.
//
// Page-level authz gates on the viewer's *real* manager status (not
// simulated view) so a non-manager can't reach the page by guessing
// the URL. Mirrors the existing /review and /people-ops pattern.
export default async function TeamPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isManager(employeeId))) notFound()

  const data = await getTeamRecognitionsForQuarter(employeeId)
  const hasContent = data.groups.length > 0

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        title="My team"
        description="This quarter's recognitions for your direct reports."
        actions={<TeamExportButton enabled={hasContent} />}
      />

      {hasContent ? (
        <TeamRecognitionsFeed groups={data.groups} />
      ) : (
        <EmptyState title="No recognitions this quarter." />
      )}
    </main>
  )
}

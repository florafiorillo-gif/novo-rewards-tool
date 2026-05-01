import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getTeamRhythm, TEAM_RHYTHM_WINDOW_DAYS } from '@/modules/dashboard/manager-view'
import { isManager } from '@/modules/employees/service'
import { parseViewParam } from '@/modules/dashboard/views'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

// Manager-scoped view of direct reports. One row per report: name,
// role · geo, recognition count in the rolling window, and an inline
// "Recognize {firstName}" CTA. Sort comes from the service layer —
// never-recognized first, then least-recently-recognized, then
// most-recently-recognized.
//
// Reads ?view= so demo-mode simulations propagate forward to the
// inline Recognize buttons — clicking one in Manager sim should land
// on /nominations/new still in Manager sim, not the user's real role.
export default async function TeamPage({
  searchParams,
}: {
  searchParams?: { view?: string }
}) {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isManager(employeeId))) notFound()

  const rhythm = await getTeamRhythm(employeeId)
  const simulated = parseViewParam(searchParams?.view)
  const viewSuffix = simulated ? `&view=${simulated}` : ''

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="My team"
        title="My team"
        description={`Your direct reports and their recognition over the last ${TEAM_RHYTHM_WINDOW_DAYS} days.`}
      />

      {rhythm.entries.length === 0 ? (
        <EmptyState
          title="No direct reports"
          description="This view is for managers. Once Zoho reports a direct-report relationship we'll populate it here."
        />
      ) : (
        <ul className="divide-y divide-novo-border overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
          {rhythm.entries.map((entry) => (
            <li
              key={entry.report.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-novo-ink">
                  {entry.report.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-novo-subtle">
                  {entry.report.role_title} · {entry.report.geo}
                </p>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <RecognitionCount count={entry.count_in_window} />
                <LinkButton
                  href={`/nominations/new?nominee=${entry.report.id}${viewSuffix}`}
                  variant="secondary"
                  size="sm"
                >
                  Recognize {firstName(entry.report.name)}
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

// Right-side signal: an amber "Never recognized" pill when the count
// is zero (the case the manager should notice), otherwise a quiet
// numeric tally. The pill carries the never-recognized message on its
// own — no separate text — so the row reads cleanly.
function RecognitionCount({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-900">
        Never recognized in {TEAM_RHYTHM_WINDOW_DAYS} days
      </span>
    )
  }
  return (
    <span className="text-xs text-novo-subtle tabular">
      {count} {count === 1 ? 'recognition' : 'recognitions'}
    </span>
  )
}

function firstName(full: string): string {
  return full.split(' ')[0] ?? full
}

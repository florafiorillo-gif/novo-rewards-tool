import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getTeamRhythm, TEAM_RHYTHM_WINDOW_DAYS } from '@/modules/dashboard/manager-view'
import { isManager } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { PageHeader } from '@/components/ui/PageHeader'
import { TeamRhythmCard } from '@/components/dashboard/TeamRhythmCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

// Manager-scoped focused view of direct reports: the same TeamRhythm
// signal as the sidebar card, rendered at full width, plus a richer
// per-report list with inline "Recognize [name]" CTAs. Nothing
// approval-side (that's /review) and nothing budget-side (that's on
// the main dashboard). Kept deliberately narrow.
export default async function TeamPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isManager(employeeId))) notFound()

  const rhythm = await getTeamRhythm(employeeId)

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="My team"
        title="Team rhythm"
        description={`Direct reports and their recognition over the last ${TEAM_RHYTHM_WINDOW_DAYS} days. Never-recognized names surface first.`}
      />

      {rhythm.entries.length === 0 ? (
        <EmptyState
          title="No direct reports"
          description="This view is for managers. Once Zoho reports a direct-report relationship we'll populate it here."
        />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              At a glance
            </h2>
            <TeamRhythmCard view={rhythm} />
          </section>

          <section>
            <h2 className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Each report
            </h2>
            <ul className="divide-y divide-novo-border overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
              {rhythm.entries.map((entry) => {
                const value = entry.last_value_id
                  ? getValueById(entry.last_value_id)
                  : null
                return (
                  <li
                    key={entry.report.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-novo-ink">
                        {entry.report.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-novo-subtle">
                        {entry.report.role_title} · {entry.report.geo}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <LastRecognition
                          at={entry.last_recognized_at}
                          valueName={value?.name ?? null}
                        />
                      </div>
                    </div>
                    <LinkButton
                      href={`/nominations/new?nominee=${entry.report.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      Recognize {firstName(entry.report.name)}
                    </LinkButton>
                  </li>
                )
              })}
            </ul>
          </section>

          <p className="text-xs text-novo-muted">
            <Link href="/dashboard" className="underline underline-offset-2 hover:text-novo-ink">
              Back to dashboard
            </Link>
          </p>
        </div>
      )}
    </main>
  )
}

function LastRecognition({
  at,
  valueName,
}: {
  at: Date | null
  valueName: string | null
}) {
  if (!at) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-900">
        Never recognized in window
      </span>
    )
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - at.getTime()) / (24 * 60 * 60 * 1000))
  )
  const when =
    days === 0
      ? 'Today'
      : days === 1
        ? '1 day ago'
        : `${days} days ago`
  return (
    <>
      <span className="text-xs text-novo-subtle tabular">{when}</span>
      {valueName && (
        <span className="inline-flex items-center rounded-full bg-novo-pink-tint px-2 py-0.5 text-2xs font-medium text-novo-oxblood">
          {valueName}
        </span>
      )}
    </>
  )
}

function firstName(full: string): string {
  return full.split(' ')[0] ?? full
}

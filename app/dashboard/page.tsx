import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  getManagerDashboardView,
  getTeamRhythm,
} from '@/modules/dashboard/manager-view'
import { getDepartmentDashboardView } from '@/modules/dashboard/department-view'
import { getRecognitionFeed } from '@/modules/dashboard/recognition-feed'
import { getRecipientDashboardView } from '@/modules/dashboard/recipient-view'
import { getPeopleTeamDashboardView } from '@/modules/dashboard/people-team-view'
import { resolveRole } from '@/modules/roles/resolver'
import { listCommitteeQueue } from '@/modules/committee/service'
import { listManualFulfillmentQueue } from '@/modules/fulfillment/queries'
import { countDeniedInRange } from '@/modules/approvals/queries'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { ManagerPoolCard } from '@/components/dashboard/ManagerPoolCard'
import { DepartmentPoolCard } from '@/components/dashboard/DepartmentPoolCard'
import { RecognitionFeed } from '@/components/dashboard/RecognitionFeed'
import { ProgramHealthCard } from '@/components/dashboard/ProgramHealthCard'
import { RecognizeCTACard } from '@/components/dashboard/RecognizeCTACard'
import { TeamRhythmCard } from '@/components/dashboard/TeamRhythmCard'
import { YourActivityCard } from '@/components/dashboard/YourActivityCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const employeeId = session.user.employeeId
  if (!employeeId) redirect('/auth/signin')

  // resolveRole returns the viewer's full role set as independent booleans —
  // a viewer can be several at once (Flora = people_team + committee).
  // Widget composition ORs across the flags so each role contributes its
  // cards once and only once.
  const role = await resolveRole(employeeId)

  const [
    view,
    deptView,
    feed,
    recipientView,
    teamRhythm,
    tier3Queue,
    fulfillmentQueue,
    programView,
    displayablePeriod,
  ] = await Promise.all([
    getManagerDashboardView(employeeId),
    getDepartmentDashboardView(employeeId),
    getRecognitionFeed(employeeId, 20),
    getRecipientDashboardView(employeeId),
    role.is_manager
      ? getTeamRhythm(employeeId)
      : Promise.resolve(null),
    role.is_committee ? listCommitteeQueue(employeeId) : Promise.resolve([]),
    role.is_people_team
      ? listManualFulfillmentQueue()
      : Promise.resolve([]),
    role.is_people_team
      ? getPeopleTeamDashboardView(employeeId)
      : Promise.resolve(null),
    role.is_people_team ? getDisplayablePeriod() : Promise.resolve(null),
  ])

  // Denials during the current period — backs the new "Denials to review"
  // row on the People team admin queue. Only fetched when the viewer is a
  // People team rep; the count is a signal for pattern-flag follow-up, not
  // an action queue, so it's null-safe if no period is active.
  const deniedCount =
    role.is_people_team && displayablePeriod?.period
      ? await countDeniedInRange(
          displayablePeriod.period.start_date,
          displayablePeriod.period.end_date
        )
      : 0

  const { period, in_grace, grace_ends_at, pool, pacing, pending_tier1_count } =
    view
  const isDeptHead = deptView.department !== null
  const totalPending = pending_tier1_count + deptView.pending_tier2_count
  const tier3Count = tier3Queue.length
  const fulfillmentCount = fulfillmentQueue.length
  const receivedCount = recipientView.items.length
  const givenCount = recipientView.given_count

  const isAdmin = role.is_committee || role.is_people_team
  const hasAdminQueueItems =
    isAdmin &&
    (totalPending > 0 ||
      tier3Count > 0 ||
      fulfillmentCount > 0 ||
      deniedCount > 0)
  const hasActivity = !isAdmin && (receivedCount > 0 || givenCount > 0)
  const hasTeamRhythm =
    role.is_manager && !!teamRhythm && teamRhythm.entries.length > 0
  const hasProgramHealth = role.is_people_team && !!programView?.period

  const feedIsEmpty = feed.length === 0
  // Employee-only viewers always get the sidebar so the Recognize CTA has
  // somewhere to land. Everyone else collapses to single-column when both
  // sides would otherwise be near-empty.
  const hasSidebarContent =
    role.is_employee_only ||
    totalPending > 0 ||
    !!(pool && period && pacing) ||
    (isDeptHead &&
      !!(
        deptView.dept_pool &&
        deptView.dept_pacing &&
        deptView.period &&
        deptView.department &&
        deptView.geo
      )) ||
    hasAdminQueueItems ||
    hasActivity ||
    hasTeamRhythm ||
    hasProgramHealth
  const showSidebar = !feedIsEmpty || hasSidebarContent

  return (
    <main className="mx-auto max-w-shell px-6 py-8 lg:py-12">
      {/* ── Greeting row ──────────────────────────────────────────────── */}
      <header className="mb-8">
        {period ? (
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            {period.period_label}
          </p>
        ) : deptView.period ? (
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            {deptView.period.period_label}
          </p>
        ) : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
          {greet(session.user.name)}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-novo-subtle">
          Recognitions from across Novo appear here as they&rsquo;re approved.
        </p>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      {showSidebar ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="feed-heading" className="min-w-0">
            <h2
              id="feed-heading"
              className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted"
            >
              Recent recognition
            </h2>
            <RecognitionFeed items={feed} viewerId={employeeId} />
          </section>

          <aside className="space-y-4">
            {role.is_employee_only && <RecognizeCTACard />}

            {totalPending > 0 && (
              <PendingForYou
                tier1={pending_tier1_count}
                tier2={deptView.pending_tier2_count}
              />
            )}

            {pool && period && pacing && (
              <ManagerPoolCard
                period={period}
                pool={pool}
                pacing={pacing}
                in_grace={in_grace}
                grace_ends_at={grace_ends_at}
              />
            )}

            {isDeptHead &&
              deptView.dept_pool &&
              deptView.dept_pacing &&
              deptView.period &&
              deptView.department &&
              deptView.geo && (
                <DepartmentPoolCard
                  department={deptView.department}
                  geo={deptView.geo}
                  period={deptView.period}
                  pool={deptView.dept_pool}
                  pacing={deptView.dept_pacing}
                  in_grace={deptView.in_grace}
                  grace_ends_at={deptView.grace_ends_at}
                />
              )}

            {hasTeamRhythm && teamRhythm && (
              <TeamRhythmCard view={teamRhythm} />
            )}

            {hasAdminQueueItems && (
              <YourQueueCard
                pendingApprovals={totalPending}
                tier3Count={role.is_committee ? tier3Count : 0}
                fulfillmentCount={role.is_people_team ? fulfillmentCount : 0}
                deniedCount={role.is_people_team ? deniedCount : 0}
              />
            )}

            {hasProgramHealth && programView && (
              <ProgramHealthCard
                view={programView}
                href="/people-ops/dashboard"
                eyebrow="Program health"
              />
            )}

            {hasActivity && (
              <YourActivityCard given={givenCount} received={receivedCount} />
            )}
          </aside>
        </div>
      ) : (
        <section aria-labelledby="feed-heading">
          <RecognitionFeed items={feed} viewerId={employeeId} />
        </section>
      )}
    </main>
  )
}

function greet(name: string | null | undefined): string {
  const first = name?.split(' ')[0] ?? 'there'
  return `Welcome back, ${first}.`
}

function PendingForYou({ tier1, tier2 }: { tier1: number; tier2: number }) {
  const total = tier1 + tier2
  return (
    <section
      aria-labelledby="pending-heading"
      className="rounded-lg border border-novo-ink bg-novo-ink p-5 text-novo-paper shadow-elevated"
    >
      <p
        id="pending-heading"
        className="text-2xs font-medium uppercase tracking-[0.08em] text-white/60"
      >
        Waiting on you
      </p>
      <p className="mt-1 text-2xl font-semibold tabular">
        {total}
        <span className="ml-1 text-sm font-normal text-white/70">
          {total === 1 ? 'nomination' : 'nominations'}
        </span>
      </p>
      <ul className="mt-3 space-y-1 text-xs text-white/70">
        {tier1 > 0 && <li>{tier1} as direct manager</li>}
        {tier2 > 0 && <li>{tier2} as department head</li>}
      </ul>
      <Link
        href="/approvals/queue"
        className="mt-4 inline-flex h-8 items-center rounded-md bg-white px-3 text-xs font-medium text-novo-ink hover:bg-white/90"
      >
        Review now <span aria-hidden className="ml-1">→</span>
      </Link>
    </section>
  )
}

// Admin sidebar. Only renders rows with non-zero counts; hidden entirely by
// the caller if every count is zero.
function YourQueueCard({
  pendingApprovals,
  tier3Count,
  fulfillmentCount,
  deniedCount,
}: {
  pendingApprovals: number
  tier3Count: number
  fulfillmentCount: number
  deniedCount: number
}) {
  const rows: Array<{ label: string; count: number; href: string }> = []
  if (pendingApprovals > 0)
    rows.push({
      label: 'Pending approvals',
      count: pendingApprovals,
      href: '/approvals/queue',
    })
  if (tier3Count > 0)
    rows.push({
      label: 'Pending Tier 3 reviews',
      count: tier3Count,
      href: '/committee/queue',
    })
  if (fulfillmentCount > 0)
    rows.push({
      label: 'Pending fulfillment',
      count: fulfillmentCount,
      href: '/people-ops/fulfillment',
    })
  if (deniedCount > 0)
    rows.push({
      label: 'Denials to review',
      count: deniedCount,
      href: '/people-ops/dashboard',
    })

  return (
    <section className="rounded-lg border border-novo-border bg-novo-elevated p-5 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        Your queue
      </p>
      <ul className="mt-3 divide-y divide-novo-border">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex items-center justify-between py-2.5 text-sm text-novo-ink hover:text-novo-subtle"
            >
              <span>{row.label}</span>
              <span className="ml-3 flex items-center gap-2">
                <span className="text-sm font-semibold tabular">{row.count}</span>
                <span aria-hidden className="text-novo-muted">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

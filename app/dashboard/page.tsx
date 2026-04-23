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
import {
  buildProgramView,
  getPeopleTeamDashboardView,
} from '@/modules/dashboard/people-team-view'
import { resolveRole } from '@/modules/roles/resolver'
import {
  activeViews,
  highestRealView,
  parseViewParam,
  realViews,
  VIEW_LABELS,
  type DashboardView,
} from '@/modules/dashboard/views'
import { listCommitteeQueue } from '@/modules/committee/service'
import { listManualFulfillmentQueue } from '@/modules/fulfillment/queries'
import { countDeniedInRange } from '@/modules/approvals/queries'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { ManagerPoolCard } from '@/components/dashboard/ManagerPoolCard'
import { DepartmentPoolCard } from '@/components/dashboard/DepartmentPoolCard'
import { RecognitionFeed } from '@/components/dashboard/RecognitionFeed'
import { BudgetPeriodStatusCard } from '@/components/dashboard/BudgetPeriodStatusCard'
import { ProgramHealthCard } from '@/components/dashboard/ProgramHealthCard'
import { RecognizeCTACard } from '@/components/dashboard/RecognizeCTACard'
import { TeamRhythmCard } from '@/components/dashboard/TeamRhythmCard'
import { TierThreeQueueCard } from '@/components/dashboard/TierThreeQueueCard'
import { YourActivityCard } from '@/components/dashboard/YourActivityCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { view?: string }
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const employeeId = session.user.employeeId
  if (!employeeId) redirect('/auth/signin')

  const role = await resolveRole(employeeId)
  // Demo/testing simulation via ?view=. Invalid or missing values fall
  // through to null, which renders the additive merge of real roles.
  const simulated = parseViewParam(searchParams?.view)
  const views = activeViews(role, simulated)
  const real = realViews(role)

  // Which view templates contribute to this render. Mirrors the spec
  // in modules/dashboard/views.ts.
  const showEmployee = views.has('employee')
  const showManager = views.has('manager')
  const showPeopleOps = views.has('people_ops')
  const showCommittee = views.has('committee')

  // Data fetchers are gated on whether the widget they back will
  // actually render. Simulating a view the user doesn't really hold
  // still calls the query — fine, the functions return safe empty
  // results (e.g. listCommitteeQueue for a non-committee employee
  // returns the queue contents; the decide action stays gated).
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
    showManager
      ? getManagerDashboardView(employeeId)
      : Promise.resolve(null),
    showManager
      ? getDepartmentDashboardView(employeeId)
      : Promise.resolve(null),
    getRecognitionFeed(employeeId, 20),
    showEmployee
      ? getRecipientDashboardView(employeeId)
      : Promise.resolve(null),
    showManager ? getTeamRhythm(employeeId) : Promise.resolve(null),
    showCommittee ? listCommitteeQueue(employeeId) : Promise.resolve([]),
    showPeopleOps
      ? listManualFulfillmentQueue()
      : Promise.resolve([]),
    showPeopleOps
      ? getPeopleTeamDashboardView(employeeId)
      : showCommittee
        ? buildProgramView()
        : Promise.resolve(null),
    showPeopleOps || showCommittee
      ? getDisplayablePeriod()
      : Promise.resolve(null),
  ])

  const deniedCount =
    showPeopleOps && displayablePeriod?.period
      ? await countDeniedInRange(
          displayablePeriod.period.start_date,
          displayablePeriod.period.end_date
        )
      : 0

  // ── Widget-level gating ─────────────────────────────────────────────
  // Each card's render condition ANDs its view flag with the data
  // shape it needs. Keeps empty-state fallthrough consistent whether
  // the view is the viewer's real role or a simulation.

  const managerPool =
    showManager && view?.pool && view?.period && view?.pacing ? view : null

  const deptHead = showManager && deptView?.department ? deptView : null

  const tier1Pending = showManager ? view?.pending_tier1_count ?? 0 : 0
  const tier2Pending = showManager ? deptView?.pending_tier2_count ?? 0 : 0
  const totalPending = tier1Pending + tier2Pending

  const tier3Count = tier3Queue.length
  const tier3UrgentCount = tier3Queue.filter((q) => q.nomination.urgent).length

  const fulfillmentCount = fulfillmentQueue.length
  const hasPeopleOpsQueue =
    showPeopleOps && (fulfillmentCount > 0 || deniedCount > 0)

  const periodForBadge = view?.period ?? deptView?.period ?? null

  const receivedCount = recipientView?.items.length ?? 0
  const givenCount = recipientView?.given_count ?? 0
  // Your activity is an Employee-scope widget. In default-merge mode
  // it's suppressed for admins (committee + people_ops) — their
  // Tier 3 queue / program health already represent "what's moving."
  // In simulated Employee view it shows regardless of real role.
  const hasActivity =
    showEmployee &&
    !showCommittee &&
    !showPeopleOps &&
    (receivedCount > 0 || givenCount > 0)
  // Recognize CTA lands for any viewer whose effective view set is just
  // 'employee' (either a true employee-only viewer, or someone simulating
  // Employee). Matches the intent of "give them somewhere to start."
  const showRecognizeCTA = showEmployee && views.size === 1

  const hasTeamRhythm =
    showManager && !!teamRhythm && teamRhythm.entries.length > 0

  const hasProgramHealth =
    (showPeopleOps || showCommittee) && !!programView?.period
  // Committee members get the superset drill-down (/committee/dashboard
  // layers Tier 3 decisions on top of the program view). People Ops
  // without committee hats fall through to /people-ops/dashboard.
  const programHealthHref = showCommittee
    ? '/committee/dashboard'
    : '/people-ops/dashboard'

  const hasBudgetPeriodStatus =
    (showPeopleOps || showCommittee) && !!displayablePeriod?.period

  const feedIsEmpty = feed.length === 0
  const hasSidebarContent =
    showRecognizeCTA ||
    totalPending > 0 ||
    (showCommittee && tier3Count >= 0) ||
    !!managerPool ||
    !!(
      deptHead?.dept_pool &&
      deptHead?.dept_pacing &&
      deptHead?.period &&
      deptHead?.department &&
      deptHead?.geo
    ) ||
    hasTeamRhythm ||
    hasPeopleOpsQueue ||
    hasBudgetPeriodStatus ||
    hasProgramHealth ||
    hasActivity
  const showSidebar = !feedIsEmpty || hasSidebarContent

  return (
    <main className="mx-auto max-w-shell px-6 py-8 lg:py-12">
      {/* ── Greeting row ──────────────────────────────────────────────── */}
      <header className="mb-8">
        {periodForBadge && (
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            {periodForBadge.period_label}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
          {greet(session.user.name)}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-novo-subtle">
          Recognitions from across Novo appear here as they&rsquo;re approved.
        </p>
        <ViewBadge
          role={role}
          simulated={simulated}
          real={real}
        />
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
            {showRecognizeCTA && <RecognizeCTACard />}

            {showManager && totalPending > 0 && (
              <PendingForYou tier1={tier1Pending} tier2={tier2Pending} />
            )}

            {showCommittee && (
              <TierThreeQueueCard
                total={tier3Count}
                urgent={tier3UrgentCount}
              />
            )}

            {managerPool?.pool && managerPool.period && managerPool.pacing && (
              <ManagerPoolCard
                period={managerPool.period}
                pool={managerPool.pool}
                pacing={managerPool.pacing}
                in_grace={managerPool.in_grace}
                grace_ends_at={managerPool.grace_ends_at}
              />
            )}

            {deptHead?.dept_pool &&
              deptHead.dept_pacing &&
              deptHead.period &&
              deptHead.department &&
              deptHead.geo && (
                <DepartmentPoolCard
                  department={deptHead.department}
                  geo={deptHead.geo}
                  period={deptHead.period}
                  pool={deptHead.dept_pool}
                  pacing={deptHead.dept_pacing}
                  in_grace={deptHead.in_grace}
                  grace_ends_at={deptHead.grace_ends_at}
                />
              )}

            {hasTeamRhythm && teamRhythm && (
              <TeamRhythmCard view={teamRhythm} />
            )}

            {hasPeopleOpsQueue && (
              <YourQueueCard
                fulfillmentCount={fulfillmentCount}
                deniedCount={deniedCount}
              />
            )}

            {hasBudgetPeriodStatus && displayablePeriod?.period && (
              <BudgetPeriodStatusCard
                period={displayablePeriod.period}
                inGrace={displayablePeriod.in_grace}
                graceEndsAt={displayablePeriod.grace_ends_at}
              />
            )}

            {hasProgramHealth && programView && (
              <ProgramHealthCard
                view={programView}
                href={programHealthHref}
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

// Small text badge under the greeting that names the active view.
// Real view (no simulation): reads "View as [highest]". Simulated:
// reads "View as X · simulated" so the tester knows they're not
// looking at their own default layout.
function ViewBadge({
  role,
  simulated,
  real,
}: {
  role: ReturnType<typeof import('@/modules/roles/resolver')['resolveRole']> extends Promise<infer R> ? R : never
  simulated: DashboardView | null
  real: Set<DashboardView>
}) {
  const active = simulated ?? highestRealView(role)
  const label = VIEW_LABELS[active]
  const note = simulated ? 'simulated' : real.size > 1 ? 'merged' : null

  return (
    <p className="mt-3 text-2xs uppercase tracking-[0.08em] text-novo-muted">
      View as {label}
      {note && (
        <span className="ml-1 rounded border border-novo-border bg-novo-hover px-1.5 py-0.5 font-medium text-novo-subtle">
          {note}
        </span>
      )}
    </p>
  )
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

// People Ops queue aggregator. Approvals are covered by the Manager
// view's "Waiting on you" card when the viewer also happens to be a
// manager; this card stays scoped to fulfillment + denials, which are
// the two queues unique to People Ops.
function YourQueueCard({
  fulfillmentCount,
  deniedCount,
}: {
  fulfillmentCount: number
  deniedCount: number
}) {
  const rows: Array<{ label: string; count: number; href: string }> = []
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

  if (rows.length === 0) return null

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

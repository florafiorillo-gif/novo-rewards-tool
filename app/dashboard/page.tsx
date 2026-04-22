import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getManagerDashboardView } from '@/modules/dashboard/manager-view'
import { getDepartmentDashboardView } from '@/modules/dashboard/department-view'
import { getRecognitionFeed } from '@/modules/dashboard/recognition-feed'
import { ManagerPoolCard } from '@/components/dashboard/ManagerPoolCard'
import { DepartmentPoolCard } from '@/components/dashboard/DepartmentPoolCard'
import { RecognitionFeed } from '@/components/dashboard/RecognitionFeed'
import { LinkButton } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const employeeId = session.user.employeeId
  if (!employeeId) redirect('/auth/signin')

  const [view, deptView, feed] = await Promise.all([
    getManagerDashboardView(employeeId),
    getDepartmentDashboardView(employeeId),
    getRecognitionFeed(employeeId, 20),
  ])

  const { period, in_grace, grace_ends_at, pool, pacing, pending_tier1_count } = view
  const isDeptHead = deptView.department !== null
  const totalPending = pending_tier1_count + deptView.pending_tier2_count

  return (
    <main className="mx-auto max-w-shell px-6 py-8 lg:py-12">
      {/* ── Greeting row ──────────────────────────────────────────────── */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            {period
              ? `${period.period_label}`
              : deptView.period
                ? deptView.period.period_label
                : 'No active period'}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
            {greet(session.user.name)}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-novo-subtle">
            Recognitions from across Novo land here as they&rsquo;re approved. Notice
            someone this week — the smallest acknowledgment is the one most often
            skipped.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/nominations/new" variant="primary" size="lg">
            Recognize a teammate
          </LinkButton>
        </div>
      </header>

      {/* ── Primary two-column: feed + sidebar ────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Feed column */}
        <section aria-labelledby="feed-heading" className="min-w-0">
          <h2
            id="feed-heading"
            className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted"
          >
            Recent recognition
          </h2>
          <RecognitionFeed items={feed} viewerId={employeeId} />
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
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

          {/* Minimal help pointer — primary nav is in the header. */}
          <div className="rounded-lg border border-dashed border-novo-border p-4 text-xs text-novo-subtle">
            <p className="font-medium text-novo-ink">About recognition</p>
            <p className="mt-1">
              Every nomination is an observation of one of the four values being
              lived. Keep it specific. Keep it honest.
            </p>
            <Link
              href="/settings"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-novo-ink hover:opacity-80"
            >
              Your visibility preferences <span aria-hidden>→</span>
            </Link>
          </div>
        </aside>
      </div>
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

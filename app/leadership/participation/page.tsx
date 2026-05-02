import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  isCommitteeMember,
  isPeopleTeamRep,
} from '@/modules/roles/service'
import {
  getCompanyParticipationView,
  getGeoParticipationView,
  type ParticipationStats,
} from '@/modules/dashboard/participation-view'
import type { Geo } from '@/modules/employees/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import {
  DepartmentBreakdownTable,
  GeoBreakdownTable,
  type DepartmentTableRow,
  type GeoTableRow,
} from '@/components/dashboard/ParticipationTables'

export const dynamic = 'force-dynamic'

const GEOS: readonly Geo[] = ['US', 'India', 'Colombia'] as const
const isGeo = (v: unknown): v is Geo =>
  typeof v === 'string' && (GEOS as readonly string[]).includes(v)

// Drill-down levels selected by query params:
//   /leadership/participation                  → company
//   /leadership/participation?geo=US           → geo
//
// The drill-down stops at department altitude on purpose. The
// participation page is a distribution view at leadership altitude,
// not a per-manager scorecard; per-manager + per-report drill-downs
// were retired in the participation redesign. Permissions: Committee
// or People Ops; both see the full org. Managers and employees 404
// here (managers use /dashboard/team for their narrower view).
export default async function ParticipationPage({
  searchParams,
}: {
  searchParams?: { geo?: string }
}) {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const [committee, peopleOps] = await Promise.all([
    isCommitteeMember(employeeId),
    isPeopleTeamRep(employeeId),
  ])
  if (!committee && !peopleOps) notFound()

  const geoParam = searchParams?.geo?.trim() || null

  if (geoParam && isGeo(geoParam)) {
    const view = await getGeoParticipationView(geoParam)
    return <GeoLevel view={view} />
  }

  const view = await getCompanyParticipationView()
  return <CompanyLevel view={view} />
}

// ─── Company level ──────────────────────────────────────────────────

async function CompanyLevel({
  view,
}: {
  view: Awaited<ReturnType<typeof getCompanyParticipationView>>
}) {
  const geoRows: GeoTableRow[] = view.by_geo.map((g) => ({
    geo: g.geo,
    href: `/leadership/participation?geo=${encodeURIComponent(g.geo)}`,
    active: g.stats.total_active_employees,
    recogs: g.stats.total_recognitions,
    given_pct: g.stats.given_pct,
    received_pct: g.stats.received_pct,
  }))

  const deptRows: DepartmentTableRow[] = view.by_department.map((d) => ({
    department: d.department,
    geo: d.geo,
    active: d.stats.total_active_employees,
    recogs: d.stats.total_recognitions,
    given_pct: d.stats.given_pct,
    received_pct: d.stats.received_pct,
  }))

  return (
    <main className="mx-auto max-w-shell px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/leadership', label: 'Leadership' }}
        title="Company-wide patterns"
        description={
          view.period
            ? `${view.period.period_label} recognition flow across geos and departments.`
            : 'No active recognition period right now.'
        }
      />

      <StatBlock stats={view.stats} hint="Across all active employees this period." />

      <Section title="By geo" hint="Click any row to see departments in that geo.">
        <GeoBreakdownTable rows={geoRows} />
      </Section>

      <Section title="By department" hint="Cross-geo where applicable.">
        <DepartmentBreakdownTable rows={deptRows} />
      </Section>
    </main>
  )
}

// ─── Geo level ──────────────────────────────────────────────────────

async function GeoLevel({
  view,
}: {
  view: Awaited<ReturnType<typeof getGeoParticipationView>>
}) {
  const deptRows: DepartmentTableRow[] = view.by_department.map((d) => ({
    department: d.department,
    geo: d.geo,
    active: d.stats.total_active_employees,
    recogs: d.stats.total_recognitions,
    given_pct: d.stats.given_pct,
    received_pct: d.stats.received_pct,
  }))

  return (
    <main className="mx-auto max-w-shell px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/leadership/participation', label: 'Company' }}
        title={`${view.geo} patterns`}
        description={
          view.period
            ? `${view.period.period_label}. Departments based in ${view.geo}.`
            : 'No active recognition period right now.'
        }
      />

      <StatBlock
        stats={view.stats}
        hint={`Across ${view.stats.total_active_employees} active employees in ${view.geo}.`}
      />

      <Section title="Departments in this geo">
        {deptRows.length === 0 ? (
          <Empty>No departments with active employees in {view.geo}.</Empty>
        ) : (
          <DepartmentBreakdownTable rows={deptRows} />
        )}
      </Section>
    </main>
  )
}

// ─── Shared bits ────────────────────────────────────────────────────

function StatBlock({
  stats,
  hint,
}: {
  stats: ParticipationStats
  hint: string
}) {
  return (
    <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Active employees"
        primary={String(stats.total_active_employees)}
        secondary={hint}
      />
      <StatTile
        label="Recognitions"
        primary={String(stats.total_recognitions)}
        secondary="approved or fulfilled this period"
      />
      <StatTile
        label="Gave this period"
        primary={`${stats.given_count} of ${stats.total_active_employees}`}
        secondary={`${stats.given_pct}%`}
      />
      <StatTile
        label="Received this period"
        primary={`${stats.received_count} of ${stats.total_active_employees}`}
        secondary={`${stats.received_pct}%`}
      />
    </div>
  )
}

function StatTile({
  label,
  primary,
  secondary,
}: {
  label: string
  primary: string
  secondary: string
}) {
  return (
    <Card padded={false} className="p-5">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-novo-ink tabular">
        {primary}
      </p>
      <p className="mt-0.5 text-xs text-novo-subtle">{secondary}</p>
    </Card>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-novo-ink">{title}</h2>
        {hint && <p className="mt-1 text-xs text-novo-muted">{hint}</p>}
      </header>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card padded={false} className="p-8 text-center">
      <p className="text-sm text-novo-subtle">{children}</p>
    </Card>
  )
}

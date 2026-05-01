import { notFound, redirect } from 'next/navigation'
import { KeepViewLink } from '@/components/layout/KeepViewLink'
import { auth } from '@/auth'
import {
  isCommitteeMember,
  isPeopleTeamRep,
} from '@/modules/roles/service'
import {
  getCompanyParticipationView,
  getDepartmentParticipationView,
  getGeoParticipationView,
  getManagerParticipationView,
  type ParticipationStats,
} from '@/modules/dashboard/participation-view'
import type { Geo } from '@/modules/employees/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import {
  DepartmentBreakdownTable,
  GeoBreakdownTable,
  ManagerBreakdownTable,
  ReportTable,
  type DepartmentTableRow,
  type GeoTableRow,
  type ManagerTableRow,
  type ReportTableRow,
} from '@/components/dashboard/ParticipationTables'

export const dynamic = 'force-dynamic'

const GEOS: readonly Geo[] = ['US', 'India', 'Colombia'] as const
const isGeo = (v: unknown): v is Geo =>
  typeof v === 'string' && (GEOS as readonly string[]).includes(v)

// Drill-down levels selected by query params:
//   /leadership/participation                  → company
//   /leadership/participation?geo=US           → geo
//   /leadership/participation?department=X     → department
//   /leadership/participation?manager=emp_005  → manager
//
// Only one drill param is honored per render — first match wins in
// manager → department → geo precedence so a stale older param can't
// hide the current one. Permissions: Committee or People Ops; both
// see the full org. Managers and employees 404 here (managers use
// /dashboard/team for their narrower view).
export default async function ParticipationPage({
  searchParams,
}: {
  searchParams?: { geo?: string; department?: string; manager?: string }
}) {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const [committee, peopleOps] = await Promise.all([
    isCommitteeMember(employeeId),
    isPeopleTeamRep(employeeId),
  ])
  if (!committee && !peopleOps) notFound()

  const managerId = searchParams?.manager?.trim() || null
  const department = searchParams?.department?.trim() || null
  const geoParam = searchParams?.geo?.trim() || null

  if (managerId) {
    const view = await getManagerParticipationView(managerId)
    if (!view) notFound()
    return (
      <ManagerLevel
        view={view}
        backHref={
          department
            ? `/leadership/participation?department=${encodeURIComponent(department)}`
            : '/leadership/participation'
        }
        backLabel={department ? department : 'Company'}
      />
    )
  }

  if (department) {
    const view = await getDepartmentParticipationView(department)
    return <DepartmentLevel view={view} />
  }

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
    href: `/leadership/participation?department=${encodeURIComponent(d.department)}`,
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
            ? `${view.period.period_label}. Who's giving and receiving across geos and departments. Lowest participation appears first.`
            : 'No active recognition period right now.'
        }
      />

      <StatBlock stats={view.stats} hint="Across all active employees this period." />

      <Section title="By geo" hint="Click any row to drill into that geo's departments.">
        <GeoBreakdownTable rows={geoRows} />
      </Section>

      <Section
        title="By department"
        hint="Cross-geo where applicable; click a row to drill into managers."
      >
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
    href: `/leadership/participation?department=${encodeURIComponent(d.department)}`,
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

// ─── Department level ───────────────────────────────────────────────

async function DepartmentLevel({
  view,
}: {
  view: Awaited<ReturnType<typeof getDepartmentParticipationView>>
}) {
  const managerRows: ManagerTableRow[] = view.managers.map((m) => ({
    manager_id: m.manager_id,
    manager_name: m.manager_name,
    manager_role_title: m.manager_role_title,
    geo: m.geo,
    team_size: m.team_size,
    href: `/leadership/participation?manager=${encodeURIComponent(m.manager_id)}&department=${encodeURIComponent(view.department)}`,
    given_pct: m.stats.given_pct,
    received_pct: m.stats.received_pct,
    pool_remaining_pct: m.pool_remaining_pct,
  }))

  return (
    <main className="mx-auto max-w-shell px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/leadership/participation', label: 'Company' }}
        title={`${view.department} patterns`}
        description={
          view.period
            ? `${view.period.period_label}. Managers and team participation rates for ${view.department}.`
            : 'No active recognition period right now.'
        }
      />

      <StatBlock
        stats={view.stats}
        hint={`Across ${view.stats.total_active_employees} active employees in ${view.department}.`}
      />

      <Section
        title="Managers in this department"
        hint="Click a manager to see direct reports and their last recognition."
      >
        {managerRows.length === 0 ? (
          <Empty>No managers with reports inside this department.</Empty>
        ) : (
          <ManagerBreakdownTable rows={managerRows} />
        )}
      </Section>
    </main>
  )
}

// ─── Manager level ──────────────────────────────────────────────────

async function ManagerLevel({
  view,
  backHref,
  backLabel,
}: {
  view: Awaited<ReturnType<typeof getManagerParticipationView>>
  backHref: string
  backLabel: string
}) {
  if (!view) return notFound()

  const reportRows: ReportTableRow[] = view.reports.map((r) => ({
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    role_title: r.role_title,
    geo: r.geo,
    last_at: r.last_recognition?.at.toISOString() ?? null,
    last_value_id: r.last_recognition?.value_id ?? null,
    last_value_name: r.last_recognition?.value_name ?? null,
    last_nominator_name: r.last_recognition?.nominator_name ?? null,
    received_count: r.received_count,
  }))

  return (
    <main className="mx-auto max-w-shell px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: backHref, label: backLabel }}
        title={`${view.manager.name}'s team`}
        description={
          view.period
            ? `${view.period.period_label}. Direct reports, last recognition received, and ${view.manager.name.split(' ')[0]}'s pool utilization.`
            : 'No active recognition period right now.'
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Team size"
          primary={String(view.stats.total_active_employees)}
          secondary="direct reports"
        />
        <StatTile
          label="Team % received"
          primary={`${view.stats.received_pct}%`}
          secondary={`${view.stats.received_count}/${view.stats.total_active_employees} recognized this period`}
        />
        <StatTile
          label="Recognitions given by manager"
          primary={String(view.given_count)}
          secondary="this period"
        />
        <StatTile
          label="Pool remaining"
          primary={
            view.pool_remaining_pct === null
              ? '—'
              : `${view.pool_remaining_pct}%`
          }
          secondary={
            view.pool_allocated_usd && view.pool_spent_usd !== null
              ? `$${Math.round(view.pool_spent_usd).toLocaleString()} of $${Math.round(view.pool_allocated_usd).toLocaleString()} spent`
              : 'no Tier 1 pool this period'
          }
        />
      </div>

      <Section
        title="Direct reports"
        hint="Never-recognized first, then oldest recognition first. Click a column header to re-sort."
      >
        <ReportTable rows={reportRows} />
      </Section>

      <p className="mt-10 text-xs text-novo-muted">
        <KeepViewLink
          href={backHref}
          className="underline underline-offset-2 hover:text-novo-ink"
        >
          ← Back to {backLabel}
        </KeepViewLink>
      </p>
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
        label="% who gave"
        primary={`${stats.given_pct}%`}
        secondary={`${stats.given_count} of ${stats.total_active_employees}`}
      />
      <StatTile
        label="% who received"
        primary={`${stats.received_pct}%`}
        secondary={`${stats.received_count} of ${stats.total_active_employees}`}
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

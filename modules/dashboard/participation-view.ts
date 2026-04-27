import { db } from '@/lib/db'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { listAllMock as listAllNominationsMock } from '@/modules/nominations/mock-store'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'
import { getValueById } from '@/modules/values/constants'
import type { BudgetPeriodRecord, BudgetPoolRecord } from '@/modules/budget/types'
import type { Employee, Geo } from '@/modules/employees/types'
import type { NominationRecord } from '@/modules/nominations/types'

// Participation drill-down composer (Round 2 leadership view).
//
// Computes who's giving and receiving recognitions across the company,
// scoped to the active or in-grace period.  Four levels nest top-down:
//
//   company  → list of geos + list of departments
//   geo      → list of departments (within that geo)
//   department → list of managers (within that department)
//   manager  → list of direct reports (with last-recognition detail)
//
// All four return the same `ParticipationStats` shape so the page can
// render one StatBlock component everywhere.  Lists are pre-sorted
// "lowest participation first" so the surface that needs attention sits
// at the top by default; the page may re-sort client-side on header
// click.
//
// "Recognition" here means an approved or fulfilled nomination whose
// approved_at falls inside the period.  Submitted-but-not-yet-approved
// nominations are excluded so the percentages reflect what actually
// landed, not what's in flight.

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export interface ParticipationStats {
  total_recognitions: number
  total_active_employees: number
  // Distinct nominator_id count vs. total — % of people who gave at
  // least one recognition this period.
  given_count: number
  given_pct: number
  // Distinct nominee_id count vs. total — % of people who received
  // at least one recognition this period.
  received_count: number
  received_pct: number
}

export interface GeoSlice {
  geo: Geo
  stats: ParticipationStats
}

export interface DepartmentSlice {
  department: string
  geo: Geo | null
  stats: ParticipationStats
}

export interface ManagerSlice {
  manager_id: string
  manager_name: string
  manager_role_title: string
  geo: Geo
  team_size: number
  stats: ParticipationStats
  // null when this manager doesn't own a Tier 1 manager pool this
  // period (new hires, role changes, individual contributors who
  // happen to have one report).
  pool_remaining_pct: number | null
  pool_spent_usd: number | null
  pool_allocated_usd: number | null
}

export interface ReportRow {
  employee_id: string
  employee_name: string
  role_title: string
  geo: Geo
  // Most recent approved/fulfilled recognition for this employee in
  // the period; null if they haven't been recognized yet.
  last_recognition: {
    at: Date
    value_id: string
    value_name: string
    nominator_id: string
    nominator_name: string
  } | null
  received_count: number
}

export interface CompanyParticipationView {
  period: BudgetPeriodRecord | null
  in_grace: boolean
  stats: ParticipationStats
  by_geo: GeoSlice[]
  by_department: DepartmentSlice[]
}

export interface GeoParticipationView {
  period: BudgetPeriodRecord | null
  in_grace: boolean
  geo: Geo
  stats: ParticipationStats
  by_department: DepartmentSlice[]
}

export interface DepartmentParticipationView {
  period: BudgetPeriodRecord | null
  in_grace: boolean
  department: string
  stats: ParticipationStats
  managers: ManagerSlice[]
}

export interface ManagerParticipationView {
  period: BudgetPeriodRecord | null
  in_grace: boolean
  manager: { id: string; name: string; role_title: string; geo: Geo }
  stats: ParticipationStats
  given_count: number
  pool_remaining_pct: number | null
  pool_spent_usd: number | null
  pool_allocated_usd: number | null
  reports: ReportRow[]
}

// ─── Public composers ────────────────────────────────────────────────

export async function getCompanyParticipationView(
  now: Date = new Date()
): Promise<CompanyParticipationView> {
  const ctx = await loadContext(now)
  const stats = participationFor(ctx.employees, ctx.nominations)

  const byGeo: GeoSlice[] = (['US', 'India', 'Colombia'] as Geo[])
    .map((geo) => {
      const employees = ctx.employees.filter((e) => e.geo === geo)
      const nominations = ctx.nominations.filter((n) => {
        const nominee = ctx.employeesById.get(n.nominee_id)
        return nominee?.geo === geo
      })
      return { geo, stats: participationFor(employees, nominations) }
    })
    .filter((s) => s.stats.total_active_employees > 0)
    .sort((a, b) => a.stats.given_pct - b.stats.given_pct)

  const byDepartment = collectDepartments(ctx)
    .map(({ department, geo }) => {
      const employees = ctx.employees.filter(
        (e) => e.department === department
      )
      const nominations = ctx.nominations.filter((n) => {
        const nominee = ctx.employeesById.get(n.nominee_id)
        return nominee?.department === department
      })
      return { department, geo, stats: participationFor(employees, nominations) }
    })
    .filter((s) => s.stats.total_active_employees > 0)
    .sort((a, b) => a.stats.given_pct - b.stats.given_pct)

  return {
    period: ctx.period,
    in_grace: ctx.in_grace,
    stats,
    by_geo: byGeo,
    by_department: byDepartment,
  }
}

export async function getGeoParticipationView(
  geo: Geo,
  now: Date = new Date()
): Promise<GeoParticipationView> {
  const ctx = await loadContext(now)
  const employees = ctx.employees.filter((e) => e.geo === geo)
  const nominations = ctx.nominations.filter((n) => {
    const nominee = ctx.employeesById.get(n.nominee_id)
    return nominee?.geo === geo
  })

  const byDepartment = collectDepartments({
    ...ctx,
    employees,
  })
    .map(({ department }) => {
      const deptEmployees = employees.filter((e) => e.department === department)
      const deptNominations = nominations.filter((n) => {
        const nominee = ctx.employeesById.get(n.nominee_id)
        return nominee?.department === department
      })
      return {
        department,
        geo,
        stats: participationFor(deptEmployees, deptNominations),
      }
    })
    .filter((s) => s.stats.total_active_employees > 0)
    .sort((a, b) => a.stats.given_pct - b.stats.given_pct)

  return {
    period: ctx.period,
    in_grace: ctx.in_grace,
    geo,
    stats: participationFor(employees, nominations),
    by_department: byDepartment,
  }
}

export async function getDepartmentParticipationView(
  department: string,
  now: Date = new Date()
): Promise<DepartmentParticipationView> {
  const ctx = await loadContext(now)
  const employees = ctx.employees.filter((e) => e.department === department)
  const nominations = ctx.nominations.filter((n) => {
    const nominee = ctx.employeesById.get(n.nominee_id)
    return nominee?.department === department
  })

  // Managers in scope = anyone in this department who has at least one
  // direct report (also in this department) and is themselves still
  // active. Catches dept heads and team-lead-shaped managers without
  // requiring an explicit role flag.
  const managerIds = new Set<string>()
  for (const e of employees) {
    if (e.manager_id) managerIds.add(e.manager_id)
  }
  const managers: ManagerSlice[] = []
  for (const managerId of managerIds) {
    const manager = ctx.employeesById.get(managerId)
    if (!manager || !manager.active) continue
    if (manager.department !== department) continue

    const team = ctx.employees.filter((e) => e.manager_id === managerId)
    if (team.length === 0) continue

    const teamIds = new Set(team.map((t) => t.id))
    // Team scope = nominations *received by* members of this team.
    // (Pool utilization, given counts, etc. are separate metrics; the
    // top-of-table participation percentages are about the team's
    // recognition footprint as a unit.)
    const teamNominations = ctx.nominations.filter((n) =>
      teamIds.has(n.nominee_id)
    )

    const pool = ctx.poolsByOwner.get(managerId) ?? null
    const stats = participationFor(team, teamNominations)
    managers.push({
      manager_id: manager.id,
      manager_name: manager.name,
      manager_role_title: manager.role_title,
      geo: manager.geo,
      team_size: team.length,
      stats,
      pool_remaining_pct: pool ? remainingPct(pool) : null,
      pool_spent_usd: pool?.spent_amount_usd ?? null,
      pool_allocated_usd: pool?.allocated_amount_usd ?? null,
    })
  }
  managers.sort((a, b) => a.stats.given_pct - b.stats.given_pct)

  return {
    period: ctx.period,
    in_grace: ctx.in_grace,
    department,
    stats: participationFor(employees, nominations),
    managers,
  }
}

export async function getManagerParticipationView(
  managerId: string,
  now: Date = new Date()
): Promise<ManagerParticipationView | null> {
  const ctx = await loadContext(now)
  const manager = ctx.employeesById.get(managerId)
  if (!manager) return null
  const team = ctx.employees.filter((e) => e.manager_id === managerId)
  if (team.length === 0) return null

  const teamIds = new Set(team.map((t) => t.id))
  const teamNominations = ctx.nominations.filter((n) =>
    teamIds.has(n.nominee_id)
  )
  const stats = participationFor(team, teamNominations)

  // Recognitions written by this manager during the period — separate
  // from team participation (which is about who received). Counts
  // approved + fulfilled to match the rest of the page.
  const givenByManager = ctx.nominations.filter(
    (n) => n.nominator_id === managerId
  ).length

  // Per-report last-recognition detail. Mirrors the team-rhythm shape
  // but adds nominator name so the page can show "Recognized by X
  // for Y" inline.
  const reports: ReportRow[] = team.map((employee) => {
    const received = teamNominations.filter((n) => n.nominee_id === employee.id)
    const sortedDesc = received.slice().sort((a, b) => {
      const ta = (a.approved_at ?? a.submitted_at).getTime()
      const tb = (b.approved_at ?? b.submitted_at).getTime()
      return tb - ta
    })
    const latest = sortedDesc[0] ?? null
    const last_recognition = latest
      ? {
          at: latest.approved_at ?? latest.submitted_at,
          value_id: latest.value_id,
          value_name: getValueById(latest.value_id)?.name ?? latest.value_id,
          nominator_id: latest.nominator_id,
          nominator_name:
            ctx.employeesById.get(latest.nominator_id)?.name ?? 'Unknown',
        }
      : null
    return {
      employee_id: employee.id,
      employee_name: employee.name,
      role_title: employee.role_title,
      geo: employee.geo,
      last_recognition,
      received_count: received.length,
    }
  })

  // Default sort: never-recognized first, then oldest-recognition
  // ascending. Same intent as TeamRhythm — show the names that need
  // attention before the names that are already getting it.
  reports.sort((a, b) => {
    if (!a.last_recognition && b.last_recognition) return -1
    if (a.last_recognition && !b.last_recognition) return 1
    if (!a.last_recognition && !b.last_recognition) {
      return a.employee_name.localeCompare(b.employee_name)
    }
    return a.last_recognition!.at.getTime() - b.last_recognition!.at.getTime()
  })

  const pool = ctx.poolsByOwner.get(managerId) ?? null
  return {
    period: ctx.period,
    in_grace: ctx.in_grace,
    manager: {
      id: manager.id,
      name: manager.name,
      role_title: manager.role_title,
      geo: manager.geo,
    },
    stats,
    given_count: givenByManager,
    pool_remaining_pct: pool ? remainingPct(pool) : null,
    pool_spent_usd: pool?.spent_amount_usd ?? null,
    pool_allocated_usd: pool?.allocated_amount_usd ?? null,
    reports,
  }
}

// ─── Internal ────────────────────────────────────────────────────────

interface Context {
  period: BudgetPeriodRecord | null
  in_grace: boolean
  employees: Employee[]
  employeesById: Map<string, Employee>
  // Approved/fulfilled nominations whose approved_at falls in the period.
  nominations: NominationRecord[]
  // Manager Tier 1 pools for the period, indexed by owner_id for cheap
  // per-manager lookup.
  poolsByOwner: Map<string, BudgetPoolRecord>
}

async function loadContext(now: Date): Promise<Context> {
  const displayable = await getDisplayablePeriod(now)
  const period = displayable?.period ?? null
  const in_grace = displayable?.in_grace ?? false

  const employees = await loadActiveEmployees()
  const employeesById = new Map(employees.map((e) => [e.id, e]))

  const nominations = period
    ? await loadPeriodNominations(period)
    : []

  const pools = period ? await listPoolsForPeriod(period.id) : []
  const poolsByOwner = new Map<string, BudgetPoolRecord>()
  for (const pool of pools) {
    if (pool.pool_type === 'manager_tier1' && pool.owner_id) {
      poolsByOwner.set(pool.owner_id, pool)
    }
  }

  return { period, in_grace, employees, employeesById, nominations, poolsByOwner }
}

async function loadActiveEmployees(): Promise<Employee[]> {
  if (useMock()) {
    return MOCK_EMPLOYEES.filter((e) => e.active)
  }
  return (await db.employee.findMany({
    where: { active: true },
  })) as unknown as Employee[]
}

async function loadPeriodNominations(
  period: BudgetPeriodRecord
): Promise<NominationRecord[]> {
  const inWindow = (n: NominationRecord): boolean => {
    if (n.status !== 'approved' && n.status !== 'fulfilled') return false
    const ts = n.approved_at ?? n.submitted_at
    return ts >= period.start_date && ts <= period.end_date
  }
  if (useMock()) {
    return listAllNominationsMock().filter(inWindow)
  }
  return (await db.nomination.findMany({
    where: {
      status: { in: ['approved', 'fulfilled'] },
      OR: [
        {
          approved_at: { gte: period.start_date, lte: period.end_date },
        },
        {
          AND: [
            { approved_at: null },
            { submitted_at: { gte: period.start_date, lte: period.end_date } },
          ],
        },
      ],
    },
  })) as unknown as NominationRecord[]
}

function participationFor(
  employees: Employee[],
  nominations: NominationRecord[]
): ParticipationStats {
  const total_active_employees = employees.length
  const total_recognitions = nominations.length
  const employeeIds = new Set(employees.map((e) => e.id))

  // Givers / receivers are restricted to employees in the current
  // slice — so a US-geo nomination written by an India employee
  // doesn't count toward US "% gave" even though it lives in the
  // US slice via the nominee.
  const givers = new Set<string>()
  const receivers = new Set<string>()
  for (const n of nominations) {
    if (employeeIds.has(n.nominator_id)) givers.add(n.nominator_id)
    if (employeeIds.has(n.nominee_id)) receivers.add(n.nominee_id)
  }
  const given_count = givers.size
  const received_count = receivers.size

  const pct = (numer: number, denom: number) =>
    denom === 0 ? 0 : Math.round((numer / denom) * 100)

  return {
    total_recognitions,
    total_active_employees,
    given_count,
    given_pct: pct(given_count, total_active_employees),
    received_count,
    received_pct: pct(received_count, total_active_employees),
  }
}

function collectDepartments(ctx: {
  employees: Employee[]
  employeesById: Map<string, Employee>
}): Array<{ department: string; geo: Geo | null }> {
  // Department label is shared across geos in seed data (one
  // "Engineering" with US + India members). Surface a single row per
  // department; the geo field is set when every member sits in one
  // geo and null otherwise.
  const byDept = new Map<string, Set<Geo>>()
  for (const e of ctx.employees) {
    if (!e.department) continue
    const set = byDept.get(e.department) ?? new Set()
    set.add(e.geo)
    byDept.set(e.department, set)
  }
  const out: Array<{ department: string; geo: Geo | null }> = []
  for (const [department, geos] of byDept) {
    out.push({
      department,
      geo: geos.size === 1 ? [...geos][0]! : null,
    })
  }
  return out
}

function remainingPct(pool: BudgetPoolRecord): number {
  if (pool.allocated_amount_usd === 0) return 0
  return Math.round(
    (pool.remaining_amount_usd / pool.allocated_amount_usd) * 100
  )
}

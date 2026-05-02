import { db } from '@/lib/db'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listAllMock as listAllNominationsMock } from '@/modules/nominations/mock-store'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'
import type { BudgetPeriodRecord } from '@/modules/budget/types'
import type { Employee, Geo } from '@/modules/employees/types'
import type { NominationRecord } from '@/modules/nominations/types'

// Participation drill-down composer for the leadership-altitude
// distribution view. Two levels:
//
//   company → list of geos + list of departments
//   geo     → list of departments (within that geo)
//
// The drill-down stops at department altitude. Per-manager and per-
// report views were retired in the participation redesign because
// the page is a distribution snapshot, not a per-manager scorecard.
//
// Both levels return the same `ParticipationStats` shape so the page
// renders one StatBlock component everywhere. Lists are pre-sorted
// by lowest given-pct first; the page re-sorts client-side on header
// click (default sort there is alphabetical).
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

// ─── Internal ────────────────────────────────────────────────────────

interface Context {
  period: BudgetPeriodRecord | null
  in_grace: boolean
  employees: Employee[]
  employeesById: Map<string, Employee>
  // Approved/fulfilled nominations whose approved_at falls in the period.
  nominations: NominationRecord[]
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

  return { period, in_grace, employees, employeesById, nominations }
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

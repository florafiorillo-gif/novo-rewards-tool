import { db } from '@/lib/db'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { countPendingTier2ForDeptHead } from '@/modules/approvals/queries'
import { getEmployeeById } from '@/modules/employees/service'
import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import type { Employee, Geo } from '@/modules/employees/types'

// Spec §3 + §10.5 — department heads see their department's Tier 2 pool
// plus their managers' Tier 1 pools on demand. Tier is internal plumbing
// (spec §2 principle 1), so copy in the UI layer labels these as "your
// department's recognition pool" and "manager pools in your department"
// rather than Tier 2 / Tier 1.
//
// Scope: a dept head's visibility is (department, geo)-scoped. A dept head
// for Engineering/US sees the Engineering/US Tier 2 pool and the Tier 1
// pools of managers in Engineering/US. Cross-geo visibility belongs to the
// People team surface, not here.

export interface ManagerPoolSummary {
  manager: Employee
  pool: BudgetPoolRecord
  pacing: PacingIndicator
}

export interface DepartmentDashboardView {
  // Null when the viewer is not a department head — UI hides the section.
  department: string | null
  geo: Geo | null
  // Null when no active or in-grace period exists.
  period: BudgetPeriodRecord | null
  in_grace: boolean
  grace_ends_at: Date | null
  // Null when the period has no allocated department pool yet (new dept,
  // zero headcount at allocation time, etc.).
  dept_pool: BudgetPoolRecord | null
  dept_pacing: PacingIndicator | null
  // Tier 2 only — scoped to nominations where the viewer is the snapshot
  // dept head. Peer Tier 2 items where another dept head in the same
  // department is the approver don't surface here.
  pending_tier2_count: number
  // Managers in the same (department, geo) with a manager_tier1 pool this
  // period. Empty list is valid (small dept, individual-contributor-only).
  manager_pools: ManagerPoolSummary[]
}

const EMPTY_VIEW: DepartmentDashboardView = {
  department: null,
  geo: null,
  period: null,
  in_grace: false,
  grace_ends_at: null,
  dept_pool: null,
  dept_pacing: null,
  pending_tier2_count: 0,
  manager_pools: [],
}

export async function getDepartmentDashboardView(
  employeeId: string,
  now: Date = new Date()
): Promise<DepartmentDashboardView> {
  const viewer = await getEmployeeById(employeeId)
  if (!viewer || !viewer.is_department_head || !viewer.department) {
    return EMPTY_VIEW
  }

  const displayable = await getDisplayablePeriod(now)
  const period = displayable?.period ?? null

  if (!period) {
    return {
      ...EMPTY_VIEW,
      department: viewer.department,
      geo: viewer.geo,
    }
  }

  const [pools, managers, pending_tier2_count] = await Promise.all([
    listPoolsForPeriod(period.id),
    listManagersInDepartment(viewer.department, viewer.geo),
    countPendingTier2ForDeptHead(employeeId),
  ])

  const dept_pool =
    pools.find(
      (p) =>
        p.pool_type === 'department_tier2' &&
        p.department === viewer.department &&
        p.geo === viewer.geo
    ) ?? null

  const dept_pacing = dept_pool ? computePacing({ pool: dept_pool, period, now }) : null

  const manager_pools: ManagerPoolSummary[] = managers
    .map((m) => {
      const pool = pools.find(
        (p) => p.pool_type === 'manager_tier1' && p.owner_id === m.id
      )
      if (!pool) return null
      return { manager: m, pool, pacing: computePacing({ pool, period, now }) }
    })
    .filter((x): x is ManagerPoolSummary => x !== null)
    .sort((a, b) => a.manager.name.localeCompare(b.manager.name))

  return {
    department: viewer.department,
    geo: viewer.geo,
    period,
    in_grace: displayable?.in_grace ?? false,
    grace_ends_at: displayable?.grace_ends_at ?? null,
    dept_pool,
    dept_pacing,
    pending_tier2_count,
    manager_pools,
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Active employees in this (department, geo) who manage someone — i.e.,
// have at least one active direct report. The dept head's own pool (if
// they also manage reports) is included; their view rightly surfaces it
// next to peers so they can compare.
async function listManagersInDepartment(
  department: string,
  geo: Geo
): Promise<Employee[]> {
  if (useMock()) {
    const { MOCK_EMPLOYEES } = await import('@/modules/employees/mock-data')
    const inDept = MOCK_EMPLOYEES.filter(
      (e) => e.active && e.department === department && e.geo === geo
    )
    const withReports = new Set(
      MOCK_EMPLOYEES.filter((e) => e.active && e.manager_id).map((e) => e.manager_id!)
    )
    return inDept.filter((e) => withReports.has(e.id))
  }

  // Managers with at least one active report, scoped to the same dept+geo.
  // _count on the relation would be cleanest, but the Employee model uses
  // a self-relation via manager_id — filter on the relation's `some` and
  // let Postgres resolve the existence check.
  const rows = await db.employee.findMany({
    where: {
      active: true,
      department,
      geo,
      direct_reports: { some: { active: true } },
    },
  })
  return rows as unknown as Employee[]
}

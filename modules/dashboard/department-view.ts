import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { countPendingTier2ForDeptHead } from '@/modules/approvals/queries'
import { getEmployeeById } from '@/modules/employees/service'
import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import type { Geo } from '@/modules/employees/types'

// Spec §3 + §10.5 — department heads see their department's Tier 2 pool.
// Tier is internal plumbing (spec §2 principle 1), so copy in the UI layer
// labels this as "your department's recognition pool" rather than Tier 2.
//
// Scope: a dept head's visibility is (department, geo)-scoped. A dept head
// for Engineering/US sees the Engineering/US Tier 2 pool. Cross-geo
// visibility belongs to the People team surface, not here.

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

  const [pools, pending_tier2_count] = await Promise.all([
    listPoolsForPeriod(period.id),
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

  return {
    department: viewer.department,
    geo: viewer.geo,
    period,
    in_grace: displayable?.in_grace ?? false,
    grace_ends_at: displayable?.grace_ends_at ?? null,
    dept_pool,
    dept_pacing,
    pending_tier2_count,
  }
}

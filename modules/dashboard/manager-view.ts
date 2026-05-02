import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { countPendingTier1ForApprover } from '@/modules/approvals/queries'
import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'

// Spec §10.5 — managers see their own Tier 1 pool + a pacing chip
// (on_track / running_hot / under_utilized). No cross-manager visibility.
// Tier is internal plumbing (spec §2 principle 1), so the surface never
// says "Tier 1" — the pool is labeled "Your recognition pool".

export interface ManagerDashboardView {
  // Null when no active or in-grace period exists — the UI renders an
  // "off-cycle" state. During the 14-day close-grace window the period is
  // still present and `in_grace` is true so the pool stays drawable.
  period: BudgetPeriodRecord | null
  in_grace: boolean
  grace_ends_at: Date | null
  // Null when the viewer isn't an allocated manager this period (individual
  // contributors, new hires before allocation, etc.). UI hides the pool card.
  pool: BudgetPoolRecord | null
  pacing: PacingIndicator | null
  // Tier 1 only — mixed-role viewers (manager + dept head + committee)
  // see their Tier 2/3 pending work on the forthcoming role-specific
  // dashboards, not conflated onto the manager surface.
  pending_tier1_count: number
}

export async function getManagerDashboardView(
  employeeId: string,
  now: Date = new Date()
): Promise<ManagerDashboardView> {
  const displayable = await getDisplayablePeriod(now)
  const period = displayable?.period ?? null
  const pool = period ? await findManagerPool(employeeId, period.id) : null
  const pacing = pool && period ? computePacing({ pool, period, now }) : null

  const pending_tier1_count = await countPendingTier1ForApprover(employeeId)

  return {
    period,
    in_grace: displayable?.in_grace ?? false,
    grace_ends_at: displayable?.grace_ends_at ?? null,
    pool,
    pacing,
    pending_tier1_count,
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function findManagerPool(
  employeeId: string,
  periodId: string
): Promise<BudgetPoolRecord | null> {
  const pools = await listPoolsForPeriod(periodId)
  return (
    pools.find(
      (p) => p.pool_type === 'manager_tier1' && p.owner_id === employeeId
    ) ?? null
  )
}

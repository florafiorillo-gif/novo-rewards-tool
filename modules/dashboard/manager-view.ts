import { db } from '@/lib/db'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { countPendingTier1ForApprover } from '@/modules/approvals/queries'
import { listMockApprovalActions, useMock } from '@/modules/approvals/shared'
import { getEmployeesByIds } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import type { Employee } from '@/modules/employees/types'
import type { NominationRecord } from '@/modules/nominations/types'
import type { ValueDef } from '@/modules/values/constants'

// Spec §10.5 — managers see their own Tier 1 pool + a pacing chip
// (on_track / running_hot / under_utilized). No cross-manager visibility.
// Tier is internal plumbing (spec §2 principle 1), so the surface never
// says "Tier 1" — the pool is labeled "Your recognition pool".

export interface RecentRecognitionItem {
  nomination: NominationRecord
  nominee: Employee | null
  value: ValueDef | null
  approved_at: Date
}

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
  recent: RecentRecognitionItem[]
}

const RECENT_LIMIT = 5

export async function getManagerDashboardView(
  employeeId: string,
  now: Date = new Date()
): Promise<ManagerDashboardView> {
  const displayable = await getDisplayablePeriod(now)
  const period = displayable?.period ?? null
  const pool = period ? await findManagerPool(employeeId, period.id) : null
  const pacing = pool && period ? computePacing({ pool, period, now }) : null

  const [pending_tier1_count, recent] = await Promise.all([
    countPendingTier1ForApprover(employeeId),
    pool ? listRecentTier1Approvals(employeeId, RECENT_LIMIT) : Promise.resolve([]),
  ])

  return {
    period,
    in_grace: displayable?.in_grace ?? false,
    grace_ends_at: displayable?.grace_ends_at ?? null,
    pool,
    pacing,
    pending_tier1_count,
    recent,
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

// Recent Tier 1 approvals by this actor. Undone approvals correctly drop
// out because undoApproval reverts nomination.status to 'submitted' (spec
// §13.3); the filter below rejects anything not approved|fulfilled.
//
// NOTE: A manager can't end up as the actor on an approve action for a
// nomination whose current_tier later becomes 2 or 3 — tier upgrades
// require status in {submitted, under_review}, so they happen before any
// approve action the manager would write (see approvals/upgrade.ts).
async function listRecentTier1Approvals(
  actorId: string,
  limit: number
): Promise<RecentRecognitionItem[]> {
  const raw = await fetchApproveActionsByActor(actorId, limit)
  if (raw.length === 0) return []

  // Safe to look up nominee names: the viewer was the approver, so those
  // names were already surfaced at decision time.
  const nomineeIds = raw.map((r) => r.nomination.nominee_id)
  const employees = await getEmployeesByIds(nomineeIds)

  return raw.map(({ nomination, approved_at }) => ({
    nomination,
    nominee: employees.get(nomination.nominee_id) ?? null,
    value: getValueById(nomination.value_id),
    approved_at,
  }))
}

interface ApproveActionRow {
  nomination: NominationRecord
  approved_at: Date
}

async function fetchApproveActionsByActor(
  actorId: string,
  limit: number
): Promise<ApproveActionRow[]> {
  if (useMock()) {
    // Mock path mirrors the Prisma semantics: the *latest* approve action by
    // this actor per nomination. After undo-then-reapprove the action log
    // holds [approve#1, undo, approve#2]; we want approve#2's timestamp.
    const { listAllMock } = await import('@/modules/nominations/mock-store')
    const rows: ApproveActionRow[] = []
    for (const nom of listAllMock()) {
      if (nom.current_tier !== 1) continue
      if (nom.status !== 'approved' && nom.status !== 'fulfilled') continue
      const actions = listMockApprovalActions(nom.id)
      const latestApprove = [...actions]
        .reverse()
        .find((a) => a.action === 'approve' && a.actor_id === actorId)
      if (!latestApprove) continue
      rows.push({ nomination: nom, approved_at: latestApprove.created_at })
    }
    return rows
      .sort((a, b) => b.approved_at.getTime() - a.approved_at.getTime())
      .slice(0, limit)
  }

  // Prisma: filter tier + status via the relation so the buffer can't be
  // starved by the viewer's unrelated Tier 2/3 approves (Phase 7A.1 fix).
  const actions = await db.approvalAction.findMany({
    where: {
      actor_id: actorId,
      action: 'approve',
      nomination: {
        current_tier: 1,
        status: { in: ['approved', 'fulfilled'] },
      },
    },
    orderBy: { created_at: 'desc' },
    take: limit,
    include: { nomination: true },
  })

  // Dedupe per nomination in case of re-approve after undo: orderBy desc
  // means we see approve#2 before approve#1, so keep the first seen.
  const seen = new Set<string>()
  const out: ApproveActionRow[] = []
  for (const a of actions) {
    if (seen.has(a.nomination_id)) continue
    seen.add(a.nomination_id)
    out.push({
      nomination: a.nomination as unknown as NominationRecord,
      approved_at: a.created_at,
    })
    if (out.length >= limit) break
  }
  return out
}

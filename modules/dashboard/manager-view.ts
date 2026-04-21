import { db } from '@/lib/db'
import { getActivePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { listPendingApprovalsForEmployee } from '@/modules/approvals/queries'
import { listMockApprovalActions } from '@/modules/approvals/shared'
import { getEmployeesByIds } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import type { Employee } from '@/modules/employees/types'
import type { NominationRecord } from '@/modules/nominations/types'
import type { ValueDef } from '@/modules/values/constants'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

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
  // Null when no active period exists — the UI renders an "off-cycle" state.
  period: BudgetPeriodRecord | null
  // Null when the viewer isn't an allocated manager this period (individual
  // contributors, new hires before allocation, etc.). UI hides the pool card.
  pool: BudgetPoolRecord | null
  pacing: PacingIndicator | null
  pending_count: number
  recent: RecentRecognitionItem[]
}

const RECENT_LIMIT = 5

export async function getManagerDashboardView(
  employeeId: string,
  now: Date = new Date()
): Promise<ManagerDashboardView> {
  const period = await getActivePeriod(now)
  const pool = period ? await findManagerPool(employeeId, period.id) : null
  const pacing = pool && period ? computePacing({ pool, period, now }) : null

  const [pending, recent] = await Promise.all([
    listPendingApprovalsForEmployee(employeeId),
    listRecentTier1Approvals(employeeId, RECENT_LIMIT),
  ])

  return {
    period,
    pool,
    pacing,
    pending_count: pending.length,
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

// Spec §13.3 — Tier 1 approvals are undoable within 10 minutes. For the
// dashboard "recent" list we include approved + fulfilled nominations where
// the viewer was the Tier 1 approver. We don't surface denied ones here;
// the manager view is about recognition patterns, not rejections.
async function listRecentTier1Approvals(
  actorId: string,
  limit: number
): Promise<RecentRecognitionItem[]> {
  const raw = await fetchApproveActionsByActor(actorId, limit)
  if (raw.length === 0) return []

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
    const out: ApproveActionRow[] = []
    const seen = new Set<string>()
    const { listAllMock } = await import('@/modules/nominations/mock-store')
    for (const nom of listAllMock()) {
      if (nom.current_tier !== 1) continue
      if (nom.status !== 'approved' && nom.status !== 'fulfilled') continue
      const actions = listMockApprovalActions(nom.id)
      const approveAction = actions.find(
        (a) => a.action === 'approve' && a.actor_id === actorId
      )
      if (!approveAction) continue
      if (seen.has(nom.id)) continue
      seen.add(nom.id)
      out.push({ nomination: nom, approved_at: approveAction.created_at })
    }
    return out
      .sort((a, b) => b.approved_at.getTime() - a.approved_at.getTime())
      .slice(0, limit)
  }

  // Prisma path: pull the viewer's approve actions, join to tier-1 nominations
  // in approved/fulfilled status. One query each so the count stays small.
  const actions = await db.approvalAction.findMany({
    where: { actor_id: actorId, action: 'approve' },
    orderBy: { created_at: 'desc' },
    take: limit * 3,
  })
  if (actions.length === 0) return []

  const nominationIds = Array.from(new Set(actions.map((a) => a.nomination_id)))
  const nominations = (await db.nomination.findMany({
    where: {
      id: { in: nominationIds },
      current_tier: 1,
      status: { in: ['approved', 'fulfilled'] },
    },
  })) as unknown as NominationRecord[]
  const byId = new Map(nominations.map((n) => [n.id, n]))

  const seen = new Set<string>()
  const out: ApproveActionRow[] = []
  for (const a of actions) {
    if (seen.has(a.nomination_id)) continue
    const nom = byId.get(a.nomination_id)
    if (!nom) continue
    seen.add(a.nomination_id)
    out.push({ nomination: nom, approved_at: a.created_at })
    if (out.length >= limit) break
  }
  return out
}

// Exposed for the UI to format the pacing chip with a consistent copy pass
// source. Rubina owns final copy; these are warm-tone placeholders.
export function pacingCopy(p: PacingIndicator): {
  label: string
  tone: 'green' | 'amber' | 'gray'
  hint: string
} {
  switch (p) {
    case 'on_track':
      return { label: 'On track', tone: 'green', hint: 'Pacing matches the quarter.' }
    case 'running_hot':
      return {
        label: 'Running hot',
        tone: 'amber',
        hint: 'Spending ahead of pace — worth a look before quarter-end.',
      }
    case 'under_utilized':
      return {
        label: 'Under-utilized',
        tone: 'gray',
        hint: 'There is room to recognize more this quarter.',
      }
  }
}


import { db } from '@/lib/db'
import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { countPendingTier1ForApprover } from '@/modules/approvals/queries'
import { listMockApprovalActions, useMock } from '@/modules/approvals/shared'
import { getDirectReports, getEmployeesByIds } from '@/modules/employees/service'
import { listAllMock } from '@/modules/nominations/mock-store'
import { getValueById } from '@/modules/values/constants'
import type { BudgetPeriodRecord, BudgetPoolRecord, PacingIndicator } from '@/modules/budget/types'
import type { Employee, EmployeeSummary } from '@/modules/employees/types'
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

// Rolling window used by the My team page. A manager looking at their
// team needs a consistent cadence signal, not a quarter-boundary reset —
// at the start of a new period the page would otherwise show "nobody
// recognized yet" for a week, which is misleading. Kept as a constant
// here so product can tune without touching UI code.
export const TEAM_RHYTHM_WINDOW_DAYS = 30

export interface TeamRhythmEntry {
  report: EmployeeSummary
  // Most recent approved/fulfilled recognition for this report within the
  // window. Null means nothing in the window — the UI flags it as "not
  // recognized yet in the last 30 days" to cue the manager.
  last_recognized_at: Date | null
  // Value id attached to the most-recent recognition, so the /dashboard/team
  // page can render a value tag alongside the date. Null when there's no
  // recognition in the window.
  last_value_id: string | null
  count_in_window: number
}

export interface TeamRhythmView {
  window_days: number
  entries: TeamRhythmEntry[]
}

const EMPTY_TEAM_RHYTHM: TeamRhythmView = {
  window_days: TEAM_RHYTHM_WINDOW_DAYS,
  entries: [],
}

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

// Per-report recognition cadence over a rolling window. Returns empty when
// the viewer has no active reports (individual contributor) so the page
// can show its empty state. Reports are sorted with "never recognized in
// window" first so the manager's eye catches them — the whole point of
// this view.
export async function getTeamRhythm(
  managerId: string,
  now: Date = new Date()
): Promise<TeamRhythmView> {
  const reports = await getDirectReports(managerId)
  if (reports.length === 0) return EMPTY_TEAM_RHYTHM

  const windowStart = new Date(
    now.getTime() - TEAM_RHYTHM_WINDOW_DAYS * 24 * 60 * 60 * 1000
  )
  const reportIds = reports.map((r) => r.id)
  const recognitions = await listRecognitionsForNominees(reportIds, windowStart)

  const byReport = new Map<
    string,
    { last: Date | null; last_value_id: string | null; count: number }
  >()
  for (const r of reports) {
    byReport.set(r.id, { last: null, last_value_id: null, count: 0 })
  }
  for (const nom of recognitions) {
    const at = nom.approved_at ?? nom.submitted_at
    const slot = byReport.get(nom.nominee_id)
    if (!slot) continue
    slot.count += 1
    if (!slot.last || at > slot.last) {
      slot.last = at
      slot.last_value_id = nom.value_id
    }
  }

  const entries: TeamRhythmEntry[] = reports
    .map((report) => {
      const slot = byReport.get(report.id)!
      return {
        report,
        last_recognized_at: slot.last,
        last_value_id: slot.last_value_id,
        count_in_window: slot.count,
      }
    })
    .sort((a, b) => {
      // Never-recognized first (most attention-worthy), then oldest-last
      // ascending so recently recognized reports sink to the bottom.
      if (!a.last_recognized_at && b.last_recognized_at) return -1
      if (a.last_recognized_at && !b.last_recognized_at) return 1
      if (!a.last_recognized_at && !b.last_recognized_at) {
        return a.report.name.localeCompare(b.report.name)
      }
      return a.last_recognized_at!.getTime() - b.last_recognized_at!.getTime()
    })

  return { window_days: TEAM_RHYTHM_WINDOW_DAYS, entries }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function listRecognitionsForNominees(
  nomineeIds: string[],
  sinceDate: Date
): Promise<NominationRecord[]> {
  if (nomineeIds.length === 0) return []
  if (useMock()) {
    const ids = new Set(nomineeIds)
    return listAllMock().filter(
      (n) =>
        ids.has(n.nominee_id) &&
        (n.status === 'approved' || n.status === 'fulfilled') &&
        (n.approved_at ?? n.submitted_at) >= sinceDate
    )
  }
  return (await db.nomination.findMany({
    where: {
      nominee_id: { in: nomineeIds },
      status: { in: ['approved', 'fulfilled'] },
      OR: [
        { approved_at: { gte: sinceDate } },
        { AND: [{ approved_at: null }, { submitted_at: { gte: sinceDate } }] },
      ],
    },
  })) as unknown as NominationRecord[]
}

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

import { db } from '@/lib/db'
import { listAllMock } from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import {
  getEmployeesByIds,
} from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { SYSTEM_EMPLOYEE_ID } from '@/modules/employees/mock-data'
import { getValueById } from '@/modules/values/constants'
import type { ValueDef } from '@/modules/values/constants'
import { listApprovalActions, listApprovalActionsForNominations } from './service'
import type { ApprovalActionRecord } from './types'
import { getRewardForNomination } from '@/modules/rewards/service'
import type { RewardRecord } from '@/modules/rewards/types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export type ActionNeeded =
  | 'approve' // pre-approval; viewer hasn't signed yet
  | 'select_reward' // approved, no reward; viewer is the picker
  | 'confirm_reward' // reward pending_confirm; viewer is Tier 2 rep
  | 'wait' // viewer acted, waiting on another approver

export interface HydratedNomination {
  nomination: NominationRecord
  nominator: Employee | null
  nominee: Employee | null
  value: ValueDef | null
  actions: ApprovalActionRecord[]
  action_needed: ActionNeeded
  pending_reward: RewardRecord | null
}

// Returns nominations where `employeeId` is an eligible actor right now —
// Tier 1 current approver (pre-approval + post-approval until reward is
// picked), Tier 2 snapshot dept head, or Tier 2 snapshot People team rep.
// Hydrated with bulk-loaded employees + actions: one DB round-trip for
// all nominations, one for all referenced employees, one for all actions.
export async function listPendingApprovalsForEmployee(
  employeeId: string
): Promise<HydratedNomination[]> {
  const raw = useMock()
    ? listAllMock()
        .filter((n) => isPendingForEmployee(n, employeeId))
        .sort((a, b) => a.submitted_at.getTime() - b.submitted_at.getTime())
    : ((await db.nomination.findMany({
        where: {
          OR: [
            // Pre-approval: waiting on this viewer.
            { current_approver_id: employeeId, status: 'submitted', current_tier: 1 },
            // Post-approval Tier 1, reward not yet picked. current_approver_id
            // stays pointed at the viewer even after approve, so we can
            // filter on it here too.
            { current_approver_id: employeeId, status: 'approved', current_tier: 1 },
            {
              AND: [
                { current_tier: 2, status: { in: ['under_review', 'approved'] } },
                {
                  OR: [
                    { tier2_dept_head_id: employeeId },
                    { tier2_people_team_rep_id: employeeId },
                  ],
                },
              ],
            },
          ],
        },
        orderBy: { submitted_at: 'asc' },
      })) as unknown as NominationRecord[])

  if (raw.length === 0) return []

  const employeeIds: string[] = []
  const nominationIds: string[] = []
  for (const n of raw) {
    employeeIds.push(n.nominator_id, n.nominee_id)
    nominationIds.push(n.id)
  }

  const [employees, actionsByNom, rewardsByNom] = await Promise.all([
    getEmployeesByIds(employeeIds),
    listApprovalActionsForNominations(nominationIds),
    fetchRewardsByNomination(raw),
  ])

  return raw
    .map((nomination) => {
      const reward = rewardsByNom.get(nomination.id) ?? null
      const action_needed = deriveActionNeeded(nomination, reward, employeeId)
      return {
        nomination,
        nominator: employees.get(nomination.nominator_id) ?? null,
        nominee: employees.get(nomination.nominee_id) ?? null,
        value: getValueById(nomination.value_id),
        actions: actionsByNom.get(nomination.id) ?? [],
        action_needed,
        pending_reward:
          action_needed === 'confirm_reward' ? reward : null,
      }
    })
    // A viewer with nothing left to do on a row (action_needed='wait' AND
    // reward already issued/delivered) drops off the queue. We still keep
    // 'wait' rows when the nomination is genuinely awaiting another
    // approver so the viewer can see what's blocked on whom.
    .filter((h) => !(h.action_needed === 'wait' && h.pending_reward?.status === 'issued'))
    .filter((h) => !(h.action_needed === 'wait' && h.pending_reward?.status === 'delivered'))
    .filter((h) => !(h.action_needed === 'wait' && h.nomination.status === 'approved' && !h.pending_reward))
}

function deriveActionNeeded(
  n: NominationRecord,
  reward: RewardRecord | null,
  viewerId: string
): ActionNeeded {
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  if (n.current_tier === 1) {
    if (n.status === 'submitted' && n.current_approver_id === viewerId) {
      return 'approve'
    }
    if (
      n.status === 'approved' &&
      n.current_approver_id === viewerId &&
      !reward
    ) {
      return 'select_reward'
    }
    return 'wait'
  }

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  if (n.current_tier === 2) {
    // Reward flow (after nomination is fully approved):
    if (n.status === 'approved') {
      if (
        reward?.status === 'selected_pending_confirm' &&
        n.tier2_people_team_rep_id === viewerId
      ) {
        return 'confirm_reward'
      }
      if (!reward && n.tier2_dept_head_id === viewerId) {
        return 'select_reward'
      }
      return 'wait'
    }

    // Approval phase (status=under_review): still need both signatures.
    if (n.status === 'under_review') {
      const viewerIsDeptHead = n.tier2_dept_head_id === viewerId
      const viewerIsRep = n.tier2_people_team_rep_id === viewerId
      return viewerIsDeptHead || viewerIsRep ? 'approve' : 'wait'
    }
  }

  return 'wait'
}

async function fetchRewardsByNomination(
  nominations: NominationRecord[]
): Promise<Map<string, RewardRecord>> {
  const out = new Map<string, RewardRecord>()
  const candidates = nominations.filter((n) => n.status === 'approved')
  if (candidates.length === 0) return out
  await Promise.all(
    candidates.map(async (n) => {
      const reward = await getRewardForNomination(n.id)
      if (reward) out.set(n.id, reward)
    })
  )
  return out
}

// Count-only variant scoped to Tier 1 (manager dashboard). Avoids the full
// hydration that listPendingApprovalsForEmployee does just to get a count,
// and narrows semantics so a mixed-role viewer (manager + dept head) sees
// only their Tier 1 pending items next to the Tier 1 pool card. Tier 2/3
// counts belong on the dept-head / People-team dashboards (Phase 7B/C/D).
export async function countPendingTier1ForApprover(
  employeeId: string
): Promise<number> {
  if (useMock()) {
    return listAllMock().filter(
      (n) =>
        n.current_tier === 1 &&
        n.current_approver_id === employeeId &&
        n.status === 'submitted'
    ).length
  }
  return db.nomination.count({
    where: {
      current_tier: 1,
      current_approver_id: employeeId,
      status: 'submitted',
    },
  })
}

// Count of denied nominations within a date range. Surfaced in the
// People team admin queue as "denials to review" — reps skim for pattern
// flags (recurring denials from one manager, denials of the same nominee,
// etc.). Includes both human and system auto-denies; the distinction lives
// on /people-ops/dashboard's SLA misses list.
export async function countDeniedInRange(
  start: Date,
  end: Date
): Promise<number> {
  if (useMock()) {
    return listAllMock().filter(
      (n) =>
        n.status === 'denied' &&
        n.denied_at !== null &&
        n.denied_at >= start &&
        n.denied_at <= end
    ).length
  }
  return db.nomination.count({
    where: {
      status: 'denied',
      denied_at: { gte: start, lte: end },
    },
  })
}

// Tier 2 pending count for the dept-head dashboard. Scoped to nominations
// where the viewer is the snapshot dept head — not a People-team rep, even
// if the viewer is also a rep. status covers both the approval phase
// (under_review) and the reward-selection phase (approved, dept head picks
// before the People-team rep confirms).
export async function countPendingTier2ForDeptHead(
  employeeId: string
): Promise<number> {
  if (useMock()) {
    return listAllMock().filter(
      (n) =>
        n.current_tier === 2 &&
        n.tier2_dept_head_id === employeeId &&
        (n.status === 'under_review' || n.status === 'approved')
    ).length
  }
  return db.nomination.count({
    where: {
      current_tier: 2,
      tier2_dept_head_id: employeeId,
      status: { in: ['under_review', 'approved'] },
    },
  })
}

// SLA misses for the People team surface (Phase 7C). A nomination counts
// as a miss when the SLA sweep either escalated it (last_escalation_at
// set) or auto-denied it (system actor wrote a deny action). Scoped to
// nominations submitted within the period so closed quarters don't bleed
// into the current-quarter view. Excludes Tier 3 per spec §7.6.
export interface SlaMissRecord {
  nomination: NominationRecord
  kind: 'escalated' | 'auto_denied'
  event_at: Date
}

export async function listSlaMissesForPeriod(
  period_start: Date,
  period_end: Date
): Promise<SlaMissRecord[]> {
  const within = (d: Date | null): boolean =>
    d !== null && d >= period_start && d <= period_end

  if (useMock()) {
    const out: SlaMissRecord[] = []
    const actions = new Map<string, ApprovalActionRecord[]>()
    for (const nom of listAllMock()) {
      if (nom.current_tier === 3) continue
      if (!within(nom.submitted_at)) continue
      if (nom.last_escalation_at && within(nom.last_escalation_at)) {
        out.push({
          nomination: nom,
          kind: 'escalated',
          event_at: nom.last_escalation_at,
        })
      }
      if (nom.status === 'denied') {
        if (!actions.has(nom.id)) {
          actions.set(nom.id, await listApprovalActions(nom.id))
        }
        const sysDeny = actions
          .get(nom.id)!
          .find((a) => a.action === 'deny' && a.actor_id === SYSTEM_EMPLOYEE_ID)
        if (sysDeny && within(sysDeny.created_at)) {
          out.push({
            nomination: nom,
            kind: 'auto_denied',
            event_at: sysDeny.created_at,
          })
        }
      }
    }
    return out.sort((a, b) => b.event_at.getTime() - a.event_at.getTime())
  }

  // Prisma path. Fetch candidates in a single query, then resolve the
  // system-deny rows in a batched action lookup so we don't round-trip per
  // nomination.
  const nominations = (await db.nomination.findMany({
    where: {
      current_tier: { in: [1, 2] },
      submitted_at: { gte: period_start, lte: period_end },
      OR: [
        { last_escalation_at: { gte: period_start, lte: period_end } },
        { status: 'denied' },
      ],
    },
  })) as unknown as NominationRecord[]
  if (nominations.length === 0) return []

  const deniedIds = nominations.filter((n) => n.status === 'denied').map((n) => n.id)
  const sysDenies = deniedIds.length
    ? ((await db.approvalAction.findMany({
        where: {
          nomination_id: { in: deniedIds },
          action: 'deny',
          actor_id: SYSTEM_EMPLOYEE_ID,
          created_at: { gte: period_start, lte: period_end },
        },
      })) as unknown as ApprovalActionRecord[])
    : []
  const sysDenyByNom = new Map(sysDenies.map((a) => [a.nomination_id, a]))

  const out: SlaMissRecord[] = []
  for (const nom of nominations) {
    if (nom.last_escalation_at && within(nom.last_escalation_at)) {
      out.push({
        nomination: nom,
        kind: 'escalated',
        event_at: nom.last_escalation_at,
      })
    }
    const deny = sysDenyByNom.get(nom.id)
    if (deny) {
      out.push({ nomination: nom, kind: 'auto_denied', event_at: deny.created_at })
    }
  }
  return out.sort((a, b) => b.event_at.getTime() - a.event_at.getTime())
}

function isPendingForEmployee(n: NominationRecord, employeeId: string): boolean {
  if (
    n.current_tier === 1 &&
    (n.status === 'submitted' || n.status === 'approved') &&
    n.current_approver_id === employeeId
  ) {
    return true
  }
  if (
    n.current_tier === 2 &&
    (n.status === 'under_review' || n.status === 'approved') &&
    (n.tier2_dept_head_id === employeeId ||
      n.tier2_people_team_rep_id === employeeId)
  ) {
    return true
  }
  return false
}

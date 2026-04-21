import { db } from '@/lib/db'
import { listAllMock } from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import {
  getEmployeesByIds,
} from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { getValueById } from '@/modules/values/constants'
import type { ValueDef } from '@/modules/values/constants'
import { listApprovalActionsForNominations } from './service'
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

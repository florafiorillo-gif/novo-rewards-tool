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

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export interface HydratedNomination {
  nomination: NominationRecord
  nominator: Employee | null
  nominee: Employee | null
  value: ValueDef | null
  actions: ApprovalActionRecord[]
  // Phase 5: when true, this viewer should see a "Select reward" entry
  // point instead of the approval action buttons. Set for Tier 1 approved
  // nominations without a reward yet where the viewer was the approver.
  needs_reward_selection?: boolean
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
                { current_tier: 2, status: 'under_review' },
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

  const [employees, actionsByNom, rewardFlags] = await Promise.all([
    getEmployeesByIds(employeeIds),
    listApprovalActionsForNominations(nominationIds),
    flagNominationsWithRewards(raw),
  ])

  // Drop approved-but-already-rewarded — those belong on another surface
  // (Phase 6 dashboard) not the "needs your action" queue.
  const withNeeds = raw
    .map((nomination) => {
      const hasReward = rewardFlags.has(nomination.id)
      const isApprovedAwaitingReward =
        nomination.status === 'approved' &&
        nomination.current_tier === 1 &&
        !hasReward
      return {
        nomination,
        nominator: employees.get(nomination.nominator_id) ?? null,
        nominee: employees.get(nomination.nominee_id) ?? null,
        value: getValueById(nomination.value_id),
        actions: actionsByNom.get(nomination.id) ?? [],
        needs_reward_selection: isApprovedAwaitingReward,
        _skip: nomination.status === 'approved' && hasReward,
      }
    })
    .filter((h) => !h._skip)
  return withNeeds.map(({ _skip, ...rest }) => rest)
}

async function flagNominationsWithRewards(
  nominations: NominationRecord[]
): Promise<Set<string>> {
  const out = new Set<string>()
  // Only check nominations already approved — submitted ones can't have
  // rewards by definition.
  const approved = nominations.filter((n) => n.status === 'approved')
  if (approved.length === 0) return out
  await Promise.all(
    approved.map(async (n) => {
      const reward = await getRewardForNomination(n.id)
      if (reward) out.add(n.id)
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
    n.status === 'under_review' &&
    (n.tier2_dept_head_id === employeeId ||
      n.tier2_people_team_rep_id === employeeId)
  ) {
    return true
  }
  return false
}

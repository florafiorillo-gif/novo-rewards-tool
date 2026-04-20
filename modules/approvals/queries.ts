import { db } from '@/lib/db'
import { listAllMock } from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import { getEmployeeById } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { getValueById } from '@/modules/values/constants'
import type { ValueDef } from '@/modules/values/constants'
import { listApprovalActions } from './service'
import type { ApprovalActionRecord } from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export interface HydratedNomination {
  nomination: NominationRecord
  nominator: Employee | null
  nominee: Employee | null
  value: ValueDef | null
  actions: ApprovalActionRecord[]
}

// Returns nominations where `employeeId` is an eligible actor right now —
// Tier 1 current approver, Tier 2 snapshot dept head, or Tier 2 snapshot
// People team rep. Used by /approvals/queue.
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
            { current_approver_id: employeeId, status: 'submitted', current_tier: 1 },
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

  return Promise.all(raw.map(hydrate))
}

function isPendingForEmployee(n: NominationRecord, employeeId: string): boolean {
  if (
    n.current_tier === 1 &&
    n.status === 'submitted' &&
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

async function hydrate(nomination: NominationRecord): Promise<HydratedNomination> {
  const [nominator, nominee, actions] = await Promise.all([
    getEmployeeById(nomination.nominator_id),
    getEmployeeById(nomination.nominee_id),
    listApprovalActions(nomination.id),
  ])
  return {
    nomination,
    nominator,
    nominee,
    value: getValueById(nomination.value_id),
    actions,
  }
}

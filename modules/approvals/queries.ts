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
// People team rep. Hydrated with bulk-loaded employees + actions: one DB
// round-trip for all nominations, one for all referenced employees, one
// for all actions — instead of 3 per row.
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

  if (raw.length === 0) return []

  const employeeIds: string[] = []
  const nominationIds: string[] = []
  for (const n of raw) {
    employeeIds.push(n.nominator_id, n.nominee_id)
    nominationIds.push(n.id)
  }

  const [employees, actionsByNom] = await Promise.all([
    getEmployeesByIds(employeeIds),
    listApprovalActionsForNominations(nominationIds),
  ])

  return raw.map((nomination) => ({
    nomination,
    nominator: employees.get(nomination.nominator_id) ?? null,
    nominee: employees.get(nomination.nominee_id) ?? null,
    value: getValueById(nomination.value_id),
    actions: actionsByNom.get(nomination.id) ?? [],
  }))
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

import { db } from '@/lib/db'
import { listMockRewards } from '@/modules/rewards/mock-store'
import { getEmployeesByIds } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { getNominationById } from '@/modules/nominations/service'
import type { NominationRecord } from '@/modules/nominations/types'
import { getValueById } from '@/modules/values/constants'
import type { ValueDef } from '@/modules/values/constants'
import type { RewardRecord } from '@/modules/rewards/types'
import { isManualDelivery } from './routing'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export interface HydratedFulfillmentItem {
  reward: RewardRecord
  nomination: NominationRecord
  nominee: Employee
  nominator: Employee | null
  value: ValueDef | null
}

// Items that need People Ops hands-on work:
// - status=selected AND delivery_mechanism is manual / justworks_csv / zoho_payroll
// - status=issued AND delivery_mechanism = justworks_csv (awaiting delivery confirmation)
// - status=failed (any mechanism)
export async function listManualFulfillmentQueue(): Promise<HydratedFulfillmentItem[]> {
  const allRewards = useMock()
    ? listMockRewards()
    : ((await db.reward.findMany()) as unknown as RewardRecord[])

  const pending = allRewards.filter((r) => {
    if (r.status === 'failed') return true
    if (r.status === 'selected' && isManualDelivery(r.delivery_mechanism)) return true
    if (r.status === 'issued' && r.delivery_mechanism === 'justworks_csv') return true
    return false
  })

  if (pending.length === 0) return []

  const hydrated: HydratedFulfillmentItem[] = []
  const nominations = new Map<string, NominationRecord>()
  for (const r of pending) {
    const nom = await getNominationById(r.nomination_id)
    if (nom) nominations.set(r.nomination_id, nom)
  }

  const employeeIds = new Set<string>()
  for (const nom of nominations.values()) {
    employeeIds.add(nom.nominator_id)
    employeeIds.add(nom.nominee_id)
  }
  const employees = await getEmployeesByIds([...employeeIds])

  for (const r of pending) {
    const nom = nominations.get(r.nomination_id)
    if (!nom) continue
    const nominee = employees.get(nom.nominee_id)
    if (!nominee) continue
    hydrated.push({
      reward: r,
      nomination: nom,
      nominee,
      nominator: employees.get(nom.nominator_id) ?? null,
      value: getValueById(nom.value_id),
    })
  }
  return hydrated.sort(
    (a, b) => a.reward.created_at.getTime() - b.reward.created_at.getTime()
  )
}

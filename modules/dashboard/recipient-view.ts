import { db } from '@/lib/db'
import { listAllMock } from '@/modules/nominations/mock-store'
import { getRewardForNomination } from '@/modules/rewards/service'
import { getEmployeesByIds } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import type { NominationRecord } from '@/modules/nominations/types'
import type { RewardRecord } from '@/modules/rewards/types'
import type { Employee } from '@/modules/employees/types'
import type { ValueDef } from '@/modules/values/constants'

// Spec §17 phase 7 — "recipient web view": the recipient sees their own
// recognitions. Spec §2 principles 1 + 2 are the governing constraints:
//   - Tier is internal plumbing → no tier labels in the projected shape.
//   - Dollars are role-scoped → recipients never see amounts. This is a
//     defense-in-depth check: the shape we project deliberately strips
//     amount_usd and amount_local from the reward data, so a leak would
//     require a caller to re-fetch from modules/rewards.
//
// Only approved or fulfilled nominations are surfaced — denied, cancelled,
// submitted, and under_review are private to the nominator + approver.

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export type RecipientRewardStatus =
  | 'pending_selection'
  | 'pending_confirmation'
  | 'issued'
  | 'delivered'

// Reward fields safe to show the recipient. Amounts deliberately omitted.
export interface RecipientRewardProjection {
  reward_type: RewardRecord['reward_type']
  scope_note_text: string | null
  delivery_mechanism: RewardRecord['delivery_mechanism']
  status: RecipientRewardStatus
  issued_at: Date | null
  delivered_at: Date | null
}

export interface RecipientRecognitionItem {
  nomination_id: string
  submitted_at: Date
  approved_at: Date | null
  nominator: Pick<Employee, 'id' | 'name'> | null
  value: ValueDef | null
  behavior_text: string
  outcome_text: string
  reward: RecipientRewardProjection | null
}

export interface RecipientDashboardView {
  items: RecipientRecognitionItem[]
}

const VISIBLE_STATUSES = new Set(['approved', 'fulfilled'])

export async function getRecipientDashboardView(
  employeeId: string
): Promise<RecipientDashboardView> {
  const nominations = await loadVisibleNominationsForNominee(employeeId)
  if (nominations.length === 0) return { items: [] }

  const nominatorIds = nominations.map((n) => n.nominator_id)
  const [employees, rewardsByNom] = await Promise.all([
    getEmployeesByIds(nominatorIds),
    loadRewardsByNomination(nominations.map((n) => n.id)),
  ])

  const items: RecipientRecognitionItem[] = nominations.map((nomination) => {
    const nominator = employees.get(nomination.nominator_id) ?? null
    const reward = rewardsByNom.get(nomination.id) ?? null
    return {
      nomination_id: nomination.id,
      submitted_at: nomination.submitted_at,
      approved_at: nomination.approved_at,
      // Strip to {id, name}. role_title etc. is fine to show too, but the
      // recipient view doesn't need it and restraint keeps future leaks
      // (recognition_preference, manager_id) from creeping in by accident.
      nominator: nominator ? { id: nominator.id, name: nominator.name } : null,
      value: getValueById(nomination.value_id),
      behavior_text: nomination.behavior_text,
      outcome_text: nomination.outcome_text,
      reward: reward ? projectReward(reward) : null,
    }
  })

  return { items }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function projectReward(reward: RewardRecord): RecipientRewardProjection {
  return {
    reward_type: reward.reward_type,
    scope_note_text: reward.scope_note_text,
    delivery_mechanism: reward.delivery_mechanism,
    status: mapStatus(reward.status),
    issued_at: reward.issued_at,
    delivered_at: reward.delivered_at,
  }
}

function mapStatus(raw: RewardRecord['status']): RecipientRewardStatus {
  // Internal statuses: selected_pending_confirm, selected, issued,
  // delivered, failed. Recipient-facing statuses collapse the Tier 2
  // staging states and hide `failed` — a failed reward is a People-team
  // issue, not a recipient-facing one; we show "pending" until it's
  // re-selected and fulfilled.
  switch (raw) {
    case 'selected_pending_confirm':
      return 'pending_confirmation'
    case 'selected':
      return 'pending_selection'
    case 'issued':
      return 'issued'
    case 'delivered':
      return 'delivered'
    case 'failed':
      return 'pending_selection'
    default:
      return 'pending_selection'
  }
}

async function loadVisibleNominationsForNominee(
  nomineeId: string
): Promise<NominationRecord[]> {
  if (useMock()) {
    return listAllMock()
      .filter((n) => n.nominee_id === nomineeId && VISIBLE_STATUSES.has(n.status))
      .sort((a, b) => {
        const aT = (a.approved_at ?? a.submitted_at).getTime()
        const bT = (b.approved_at ?? b.submitted_at).getTime()
        return bT - aT
      })
  }
  const rows = await db.nomination.findMany({
    where: {
      nominee_id: nomineeId,
      status: { in: ['approved', 'fulfilled'] },
    },
    orderBy: [{ approved_at: 'desc' }, { submitted_at: 'desc' }],
  })
  return rows as unknown as NominationRecord[]
}

async function loadRewardsByNomination(
  nominationIds: string[]
): Promise<Map<string, RewardRecord>> {
  const out = new Map<string, RewardRecord>()
  if (nominationIds.length === 0) return out
  await Promise.all(
    nominationIds.map(async (id) => {
      const reward = await getRewardForNomination(id)
      if (reward) out.set(id, reward)
    })
  )
  return out
}

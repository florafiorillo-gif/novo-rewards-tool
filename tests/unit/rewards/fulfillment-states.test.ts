/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  markRewardDelivered,
  markRewardFailed,
  markRewardIssued,
  selectReward,
} from '@/modules/rewards/service'
import { resetMockRewards } from '@/modules/rewards/mock-store'
import { resetMockBudget } from '@/modules/budget/mock-store'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { allocatePools } from '@/modules/budget/allocation'
import {
  approveNomination,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import {
  findByIdMock,
  resetMockNominations,
} from '@/modules/nominations/mock-store'
import { createCatalogItem } from '@/modules/catalog/service'
import { resetMockCatalog } from '@/modules/catalog/mock-store'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

async function seedApprovedPlusReward() {
  const r = await createNomination(
    {
      nominee_id: 'emp_006',
      value_id: 'val_run_for_the_bus',
      behavior_text: 'Solid contribution across multiple weeks on the migration.',
      outcome_text: 'Team avoided a missed deadline on the release cut.',
      evidence_links: [],
    },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed')
  await approveNomination({
    nomination_id: r.nomination.id,
    actor_id: 'emp_005',
  })
  const item = await createCatalogItem({
    geo: 'US',
    reward_type: 'gift_card',
    name: 'Card',
    description: '',
    amount_usd: 100,
  })
  const picked = await selectReward({
    nomination_id: r.nomination.id,
    actor_id: 'emp_005',
    catalog_item_id: item.id,
    custom: null,
    scope_note_template_id: null,
    scope_note_text: 'Thanks.',
    budget_exception: false,
  })
  if (!picked.ok) throw new Error('select')
  return { nominationId: r.nomination.id, rewardId: picked.reward.id }
}

beforeEach(async () => {
  resetMockNominations()
  resetMockApprovalActions()
  resetMockBudget()
  resetMockRewards()
  resetMockCatalog()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
  const p = await createPeriod({
    period_label: 'Q2',
    start_date: new Date(Date.now() - 1000),
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    total_allocation_usd: 100_000,
  })
  if (!p.ok) throw new Error('period')
  await allocatePools(p.period.id)
  await approvePeriod(p.period.id, 'emp_001')
  await approvePeriod(p.period.id, 'emp_002')
  await activatePeriod(p.period.id)
})

describe('reward fulfillment state machine (spec §8.4 + Q6)', () => {
  it('selected → issued → delivered, flips nomination to fulfilled', async () => {
    const { nominationId, rewardId } = await seedApprovedPlusReward()
    const issued = await markRewardIssued({
      reward_id: rewardId,
      vendor_reference_id: null,
    })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.reward.status).toBe('issued')
    expect(issued.reward.issued_at).toBeInstanceOf(Date)

    const delivered = await markRewardDelivered({ reward_id: rewardId })
    expect(delivered.ok).toBe(true)
    if (!delivered.ok) return
    expect(delivered.reward.status).toBe('delivered')
    expect(delivered.reward.delivered_at).toBeInstanceOf(Date)
    expect(findByIdMock(nominationId)?.status).toBe('fulfilled')
  })

  it('issued → failed allowed', async () => {
    const { rewardId } = await seedApprovedPlusReward()
    await markRewardIssued({ reward_id: rewardId, vendor_reference_id: null })
    const failed = await markRewardFailed({
      reward_id: rewardId,
      reason: 'vendor rejected',
    })
    expect(failed.ok).toBe(true)
    if (!failed.ok) return
    expect(failed.reward.status).toBe('failed')
  })

  it('selected → failed allowed (manual path that never reached issued)', async () => {
    const { rewardId } = await seedApprovedPlusReward()
    const failed = await markRewardFailed({
      reward_id: rewardId,
      reason: 'sourcing fell through',
    })
    expect(failed.ok).toBe(true)
  })

  it('markRewardDelivered rejects from non-issued state', async () => {
    const { rewardId } = await seedApprovedPlusReward()
    // Still `selected` — haven't issued.
    const r = await markRewardDelivered({ reward_id: rewardId })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('wrong_status')
  })

  it('markRewardIssued rejects a pending_confirm reward', async () => {
    const { rewardId } = await seedApprovedPlusReward()
    // Flip to pending_confirm manually.
    const { updateMockReward } = await import('@/modules/rewards/mock-store')
    updateMockReward(rewardId, { status: 'selected_pending_confirm' })
    const r = await markRewardIssued({
      reward_id: rewardId,
      vendor_reference_id: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('wrong_status')
  })
})

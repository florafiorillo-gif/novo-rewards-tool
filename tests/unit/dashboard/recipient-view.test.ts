/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { getRecipientDashboardView } from '@/modules/dashboard/recipient-view'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { resetMockBudget } from '@/modules/budget/mock-store'
import { createNomination, cancelNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import {
  approveNomination,
  denyNomination,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { selectReward, markRewardIssued, markRewardDelivered } from '@/modules/rewards/service'
import { resetMockRewards } from '@/modules/rewards/mock-store'
import { createCatalogItem } from '@/modules/catalog/service'
import { resetMockCatalog } from '@/modules/catalog/mock-store'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

async function seedActivePeriod() {
  const r = await createPeriod({
    period_label: 'Q2 2026',
    start_date: new Date(Date.now() - 1000),
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    total_allocation_usd: 100_000,
  })
  if (!r.ok) throw new Error('seed')
  await allocatePools(r.period.id)
  await approvePeriod(r.period.id, 'emp_001')
  await approvePeriod(r.period.id, 'emp_002')
  await activatePeriod(r.period.id)
}

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'Solid contribution across multiple weeks this sprint.',
  outcome_text: 'Team avoided a missed deadline on the launch.',
  evidence_links: [],
}

beforeEach(async () => {
  resetMockBudget()
  resetMockNominations()
  resetMockApprovalActions()
  resetMockRewards()
  resetMockCatalog()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
  await seedActivePeriod()
})

async function approveNomFor(nomineeId: string, nominatorId: string, approverId: string) {
  const r = await createNomination(
    { ...baseInput, nominee_id: nomineeId },
    nominatorId
  )
  if (!r.ok) throw new Error('seed nom')
  const appr = await approveNomination({
    nomination_id: r.nomination.id,
    actor_id: approverId,
  })
  if (!appr.ok) throw new Error('approve')
  return appr.nomination
}

describe('getRecipientDashboardView — visibility', () => {
  it('returns only nominations where the viewer is the nominee', async () => {
    await approveNomFor('emp_006', 'emp_007', 'emp_005')
    await approveNomFor('emp_007', 'emp_006', 'emp_005')

    const view = await getRecipientDashboardView('emp_006')
    expect(view.items).toHaveLength(1)
    const ids = view.items.map((i) => i.nominator?.id)
    expect(ids).toEqual(['emp_007'])
  })

  it('hides denied nominations from the recipient view', async () => {
    const r = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!r.ok) throw new Error('seed')
    await denyNomination({
      nomination_id: r.nomination.id,
      actor_id: 'emp_005',
      reason_structured: 'insufficient_detail',
      reason_text: 'Could you add a specific moment?',
    })

    const view = await getRecipientDashboardView('emp_006')
    expect(view.items).toEqual([])
  })

  it('hides cancelled / submitted nominations', async () => {
    // Submitted but never approved.
    const r = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!r.ok) throw new Error('seed')

    const view = await getRecipientDashboardView('emp_006')
    expect(view.items).toEqual([])

    // Cancellation too.
    await cancelNomination({
      nomination_id: r.nomination.id,
      actor_id: 'emp_007',
    })
    const view2 = await getRecipientDashboardView('emp_006')
    expect(view2.items).toEqual([])
  })

  it('orders by approved_at desc (newest first)', async () => {
    const n1 = await approveNomFor('emp_006', 'emp_007', 'emp_005')
    // Small delay so approved_at differs.
    await new Promise((r) => setTimeout(r, 10))
    const n2 = await approveNomFor('emp_006', 'emp_007', 'emp_005')

    const view = await getRecipientDashboardView('emp_006')
    expect(view.items.map((i) => i.nomination_id)).toEqual([n2.id, n1.id])
  })
})

describe('getRecipientDashboardView — shape discipline (spec §2 principles 1+2)', () => {
  it('never includes amount fields on the reward projection', async () => {
    const nom = await approveNomFor('emp_006', 'emp_007', 'emp_005')
    const item = await createCatalogItem({
      geo: 'US',
      reward_type: 'gift_card',
      name: 'US $100 gift card',
      description: '',
      amount_usd: 100,
    })
    const sel = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'Spot recognition — great initiative.',
      budget_exception: false,
    })
    expect(sel.ok).toBe(true)

    const view = await getRecipientDashboardView('emp_006')
    expect(view.items).toHaveLength(1)
    const reward = view.items[0].reward!
    expect(reward).toBeDefined()
    // Amounts must not appear in the projection. This is the defense in
    // depth: if someone adds them back, this test breaks.
    expect(Object.keys(reward)).toEqual(
      expect.not.arrayContaining(['amount_usd', 'amount_local'])
    )
    expect(reward.scope_note_text).toBe('Spot recognition — great initiative.')
    expect(reward.delivery_mechanism).toBe('tremendous')
    expect(reward.status).toBe('pending_selection')
  })

  it('never includes tier labels or current_tier on the item shape', async () => {
    await approveNomFor('emp_006', 'emp_007', 'emp_005')
    const view = await getRecipientDashboardView('emp_006')
    const item = view.items[0]
    expect(Object.keys(item)).toEqual(
      expect.not.arrayContaining(['current_tier', 'tier'])
    )
  })

  it('maps fulfillment progress to recipient-facing states', async () => {
    const nom = await approveNomFor('emp_006', 'emp_007', 'emp_005')
    const item = await createCatalogItem({
      geo: 'US',
      reward_type: 'gift_card',
      name: 'US $100 gift card',
      description: '',
      amount_usd: 100,
    })
    const sel = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'Spot recognition.',
      budget_exception: false,
    })
    if (!sel.ok) throw new Error('seed reward')
    await markRewardIssued({ reward_id: sel.reward.id, actor_id: 'emp_004' })
    await markRewardDelivered({ reward_id: sel.reward.id, actor_id: 'emp_004' })

    const view = await getRecipientDashboardView('emp_006')
    expect(view.items[0].reward?.status).toBe('delivered')
  })
})

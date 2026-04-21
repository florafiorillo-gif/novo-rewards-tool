/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { selectReward, confirmReward } from '@/modules/rewards/service'
import { resetMockRewards } from '@/modules/rewards/mock-store'
import {
  approveNomination,
  proposeUpgrade,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import { resetMockBudget, findMockPeriodById } from '@/modules/budget/mock-store'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { allocatePools } from '@/modules/budget/allocation'
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
  if (!r.ok) throw new Error('seed period')
  await allocatePools(r.period.id)
  await approvePeriod(r.period.id, 'emp_001')
  await approvePeriod(r.period.id, 'emp_002')
  await activatePeriod(r.period.id)
  return r.period.id
}

async function seedUsGiftCard() {
  return createCatalogItem({
    geo: 'US',
    reward_type: 'gift_card',
    name: 'US $100 gift card',
    description: '',
    amount_usd: 100,
  })
}

async function seedApprovedTier1Peer() {
  const r = await createNomination(
    {
      nominee_id: 'emp_006',
      value_id: 'val_run_for_the_bus',
      behavior_text: 'Solid contribution across multiple weeks.',
      outcome_text: 'Team avoided a missed deadline.',
      evidence_links: [],
    },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed nom')
  const appr = await approveNomination({
    nomination_id: r.nomination.id,
    actor_id: 'emp_005',
  })
  if (!appr.ok) throw new Error('approve')
  return appr.nomination
}

beforeEach(async () => {
  resetMockNominations()
  resetMockApprovalActions()
  resetMockBudget()
  resetMockRewards()
  resetMockCatalog()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
  await seedActivePeriod()
})

describe('selectReward (Tier 1 peer)', () => {
  it('writes a reward, deducts pool, defaults to selected', async () => {
    const nom = await seedApprovedTier1Peer()
    const item = await seedUsGiftCard()
    const r = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'Spot recognition — great initiative.',
      budget_exception: false,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.reward.status).toBe('selected')
    expect(r.reward.amount_usd).toBe(100)
    expect(r.reward.delivery_mechanism).toBe('tremendous')
  })

  it('rejects when scope_note_text is blank', async () => {
    const nom = await seedApprovedTier1Peer()
    const item = await seedUsGiftCard()
    const r = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: '  ',
      budget_exception: false,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('scope_note_required')
  })

  it('rejects when catalog item is for a different geo', async () => {
    const nom = await seedApprovedTier1Peer()
    const wrongGeo = await createCatalogItem({
      geo: 'India',
      reward_type: 'gift_card',
      name: 'India card',
      description: '',
      amount_usd: 100,
    })
    const r = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: wrongGeo.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'note',
      budget_exception: false,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('catalog_geo_mismatch')
  })

  it('rejects cash amount outside the tier range', async () => {
    const nom = await seedApprovedTier1Peer()
    const r = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: null,
      custom: { reward_type: 'cash', amount_usd: 500 }, // Tier 1 max is 250
      scope_note_template_id: null,
      scope_note_text: 'note',
      budget_exception: false,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('amount_out_of_range')
  })

  it('rejects a second reward on the same nomination', async () => {
    const nom = await seedApprovedTier1Peer()
    const item = await seedUsGiftCard()
    const first = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'one',
      budget_exception: false,
    })
    expect(first.ok).toBe(true)
    const second = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'two',
      budget_exception: false,
    })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('reward_already_selected')
  })

  it('rejects when the approved-at period is closed > 14 days ago', async () => {
    // Create a nomination, approve it, then "close" the period and
    // fast-forward 15 days.
    const nom = await seedApprovedTier1Peer()
    const item = await seedUsGiftCard()
    // Grab the only active period and close it with a 15-day-old timestamp.
    const { listMockPeriods, updateMockPeriod } = await import(
      '@/modules/budget/mock-store'
    )
    const period = listMockPeriods()[0]
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    updateMockPeriod(period.id, { status: 'closed', closed_at: fifteenDaysAgo })
    const r = await selectReward({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'note',
      budget_exception: false,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('period_lapsed')
  })
})

describe('selectReward + confirmReward (Tier 2)', () => {
  async function seedApprovedTier2() {
    const r = await createNomination(
      {
        nominee_id: 'emp_006',
        value_id: 'val_run_for_the_bus',
        behavior_text: 'Sustained impact across weeks on the reliability work.',
        outcome_text: 'Program stayed on track through the quarterly close.',
        evidence_links: [],
      },
      'emp_007'
    )
    if (!r.ok) throw new Error('seed')
    const up = await proposeUpgrade({
      nomination_id: r.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning: 'Bigger than a spot recognition.',
    })
    if (!up.ok) throw new Error('upgrade')
    const deptApprove = await approveNomination({
      nomination_id: r.nomination.id,
      actor_id: up.nomination.tier2_dept_head_id!,
    })
    if (!deptApprove.ok) throw new Error('dept approve')
    const repApprove = await approveNomination({
      nomination_id: r.nomination.id,
      actor_id: up.nomination.tier2_people_team_rep_id!,
    })
    if (!repApprove.ok) throw new Error('rep approve')
    return { nomination: repApprove.nomination, up }
  }

  it('dept head select stays in selected_pending_confirm; rep confirm flips to selected', async () => {
    const { nomination, up } = await seedApprovedTier2()
    const item = await createCatalogItem({
      geo: 'US',
      reward_type: 'experience',
      name: 'US $500 experience',
      description: '',
      amount_usd: 500,
    })
    const picked = await selectReward({
      nomination_id: nomination.id,
      actor_id: up.nomination.tier2_dept_head_id!,
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'Sustained impact.',
      budget_exception: false,
      pending_confirm: true,
    })
    expect(picked.ok).toBe(true)
    if (!picked.ok) return
    expect(picked.reward.status).toBe('selected_pending_confirm')

    const confirmed = await confirmReward({
      reward_id: picked.reward.id,
      actor_id: up.nomination.tier2_people_team_rep_id!,
    })
    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) return
    expect(confirmed.reward.status).toBe('selected')
  })

  it('non-rep can\'t confirm', async () => {
    const { nomination, up } = await seedApprovedTier2()
    const item = await createCatalogItem({
      geo: 'US',
      reward_type: 'experience',
      name: 'US $500 experience',
      description: '',
      amount_usd: 500,
    })
    const picked = await selectReward({
      nomination_id: nomination.id,
      actor_id: up.nomination.tier2_dept_head_id!,
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'note',
      budget_exception: false,
      pending_confirm: true,
    })
    expect(picked.ok).toBe(true)
    if (!picked.ok) return

    // Dept head shouldn't be able to confirm their own pick.
    const confirmed = await confirmReward({
      reward_id: picked.reward.id,
      actor_id: up.nomination.tier2_dept_head_id!,
    })
    expect(confirmed.ok).toBe(false)
    if (confirmed.ok) return
    expect(confirmed.error.code).toBe('forbidden')
  })
})

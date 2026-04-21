/** @jest-environment node */
import { db } from '@/lib/db'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { approveNomination } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { createCatalogItem } from '@/modules/catalog/service'
import {
  markRewardDelivered,
  markRewardIssued,
  selectReward,
} from '@/modules/rewards/service'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

describeIntegration('Reward selection + fulfillment E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
    // An active period is needed for the budget commit on reward select.
    const period = await createPeriod({
      period_label: 'Q2 2026 (reward integration)',
      start_date: new Date(Date.now() - 1_000),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      total_allocation_usd: 100_000,
    })
    if (!period.ok) throw new Error('period')
    await allocatePools(period.period.id)
    await approvePeriod(period.period.id, 'emp_001')
    await approvePeriod(period.period.id, 'emp_002')
    await activatePeriod(period.period.id)
  })

  afterAll(async () => {
    await disconnect()
  })

  it('create → approve → select reward → mark issued → delivered', async () => {
    const item = await createCatalogItem({
      geo: 'US',
      reward_type: 'gift_card',
      name: 'US integration gift card',
      description: 'test',
      amount_usd: 100,
    })

    const nom = await createNomination(
      {
        nominee_id: 'emp_006',
        value_id: 'val_run_for_the_bus',
        behavior_text:
          'Shipped the migration on a tight deadline after the reviewer was out.',
        outcome_text:
          'We saved the launch window and avoided a partial rollback.',
        evidence_links: [],
      },
      'emp_007'
    )
    if (!nom.ok) throw new Error('create')

    const approved = await approveNomination({
      nomination_id: nom.nomination.id,
      actor_id: 'emp_005',
    })
    if (!approved.ok) throw new Error('approve')

    const selected = await selectReward({
      nomination_id: nom.nomination.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text:
        'Spot recognition — great initiative during a tough week.',
      budget_exception: false,
    })
    expect(selected.ok).toBe(true)
    if (!selected.ok) return

    // Reward row persisted.
    const rewardRow = await db.reward.findUniqueOrThrow({
      where: { id: selected.reward.id },
    })
    expect(rewardRow.status).toBe('selected')
    expect(Number(rewardRow.amount_usd)).toBe(100)

    // Pool spent.
    const peerPool = await db.budgetPool.findFirstOrThrow({
      where: { pool_type: 'peer_tier1', geo: 'US' },
    })
    expect(Number(peerPool.spent_amount_usd)).toBe(100)

    // Transition issued → delivered.
    const issued = await markRewardIssued({
      reward_id: selected.reward.id,
      vendor_reference_id: null,
    })
    expect(issued.ok).toBe(true)
    const delivered = await markRewardDelivered({
      reward_id: selected.reward.id,
    })
    expect(delivered.ok).toBe(true)
    if (!delivered.ok) return

    const finalNom = await db.nomination.findUniqueOrThrow({
      where: { id: nom.nomination.id },
    })
    expect(finalNom.status).toBe('fulfilled')
  })
})

/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { allocatePools } from '@/modules/budget/allocation'
import { commitSpend, getPool, getRemaining } from '@/modules/budget/pools'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import {
  listMockPoolsForPeriod,
  resetMockBudget,
} from '@/modules/budget/mock-store'

async function seedActivePeriodWithPools() {
  const created = await createPeriod({
    period_label: 'Q2 2026',
    start_date: new Date('2026-04-01'),
    end_date: new Date('2026-06-30'),
    total_allocation_usd: 100_000,
  })
  if (!created.ok) throw new Error('seed: createPeriod')
  const alloc = await allocatePools(created.period.id)
  if (!alloc.ok) throw new Error('seed: allocatePools')
  await approvePeriod(created.period.id, 'emp_001')
  await approvePeriod(created.period.id, 'emp_002')
  await activatePeriod(created.period.id)
  return created.period.id
}

beforeEach(() => {
  resetMockBudget()
})

describe('commitSpend (Q4 decision — no pre-reservation)', () => {
  it('increments spent and decrements remaining atomically', async () => {
    const periodId = await seedActivePeriodWithPools()
    const peer = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'peer_tier1' && p.geo === 'US'
    )!
    const before = peer.remaining_amount_usd

    const r = await commitSpend({ pool_id: peer.id, amount_usd: 150 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pool.spent_amount_usd).toBe(150)
    expect(r.pool.remaining_amount_usd).toBe(before - 150)
    expect(getRemaining(r.pool)).toBe(before - 150)
  })

  it('refuses a commit that exceeds remaining balance', async () => {
    const periodId = await seedActivePeriodWithPools()
    const reserve = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'reserve'
    )!

    const r = await commitSpend({
      pool_id: reserve.id,
      amount_usd: reserve.remaining_amount_usd + 1,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('insufficient_balance')
    if (r.error.code !== 'insufficient_balance') return
    expect(r.error.remaining).toBe(reserve.remaining_amount_usd)
  })

  it('refuses zero or negative amounts', async () => {
    const periodId = await seedActivePeriodWithPools()
    const peer = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'peer_tier1'
    )!
    const zero = await commitSpend({ pool_id: peer.id, amount_usd: 0 })
    expect(zero.ok).toBe(false)
    if (zero.ok) return
    expect(zero.error.code).toBe('invalid_amount')

    const negative = await commitSpend({ pool_id: peer.id, amount_usd: -10 })
    expect(negative.ok).toBe(false)
  })

  it('returns pool_not_found for unknown pool ids', async () => {
    const r = await commitSpend({ pool_id: 'pool_nope', amount_usd: 50 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('pool_not_found')
  })

  it('sequential commits accumulate correctly', async () => {
    const periodId = await seedActivePeriodWithPools()
    const peer = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'peer_tier1' && p.geo === 'US'
    )!
    await commitSpend({ pool_id: peer.id, amount_usd: 100 })
    await commitSpend({ pool_id: peer.id, amount_usd: 200 })
    const after = await getPool(peer.id)
    expect(after?.spent_amount_usd).toBe(300)
  })
})

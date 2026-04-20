/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import {
  drawFromReserve,
  listExceptionsForPeriod,
} from '@/modules/budget/exceptions'
import { getReservePool } from '@/modules/budget/routing'
import { resetMockBudget } from '@/modules/budget/mock-store'

async function seedActive() {
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
  return r.period.id
}

beforeEach(() => {
  resetMockBudget()
})

describe('drawFromReserve (spec §10.3)', () => {
  it('draws from reserve and logs a BudgetException', async () => {
    const periodId = await seedActive()
    const r = await drawFromReserve({
      period_id: periodId,
      nomination_id: 'nom_x',
      amount_usd: 200,
      approver_id: 'emp_005',
      reason_text: 'Peer pool exhausted; urgent recognition.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.exception.nomination_id).toBe('nom_x')
    expect(r.exception.amount_usd).toBe(200)
    expect(r.reserve_remaining).toBe(10_000 - 200) // reserve = 10% of 100k
  })

  it('fails with insufficient_balance when the reserve is exhausted', async () => {
    const periodId = await seedActive()
    const reserve = await getReservePool(periodId)
    // Drain the reserve.
    await drawFromReserve({
      period_id: periodId,
      nomination_id: 'nom_drain',
      amount_usd: reserve!.remaining_amount_usd,
      approver_id: 'emp_005',
    })
    const r = await drawFromReserve({
      period_id: periodId,
      nomination_id: 'nom_overflow',
      amount_usd: 50,
      approver_id: 'emp_005',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('insufficient_balance')
  })

  it('records exceptions queryable per period', async () => {
    const periodId = await seedActive()
    await drawFromReserve({
      period_id: periodId,
      nomination_id: 'nom_a',
      amount_usd: 100,
      approver_id: 'emp_005',
    })
    await drawFromReserve({
      period_id: periodId,
      nomination_id: 'nom_b',
      amount_usd: 200,
      approver_id: 'emp_005',
    })
    const exceptions = await listExceptionsForPeriod(periodId)
    expect(exceptions).toHaveLength(2)
  })
})

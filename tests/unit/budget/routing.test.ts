/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import {
  resolvePoolForNomination,
  getReservePool,
} from '@/modules/budget/routing'
import { resetMockBudget } from '@/modules/budget/mock-store'

async function seedActive() {
  const created = await createPeriod({
    period_label: 'Q2 2026',
    start_date: new Date(Date.now() - 1000),
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    total_allocation_usd: 100_000,
  })
  if (!created.ok) throw new Error('seed failed')
  await allocatePools(created.period.id)
  await approvePeriod(created.period.id, 'emp_001')
  await approvePeriod(created.period.id, 'emp_002')
  await activatePeriod(created.period.id)
  return created.period.id
}

beforeEach(() => {
  resetMockBudget()
})

describe('resolvePoolForNomination', () => {
  it('Tier 1 peer nomination → nominee geo peer pool', async () => {
    await seedActive()
    const r = await resolvePoolForNomination({
      nomination_id: 'nom_1',
      current_tier: 1,
      nominator_id: 'emp_007',
      nominee_id: 'emp_009',
      nominee_manager_id: 'emp_008',
      nominee_geo: 'India',
      nominee_department: 'Engineering',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pool.pool_type).toBe('peer_tier1')
    expect(r.pool.geo).toBe('India')
  })

  it('Tier 1 manager-initiated → manager own pool', async () => {
    await seedActive()
    const r = await resolvePoolForNomination({
      nomination_id: 'nom_2',
      current_tier: 1,
      nominator_id: 'emp_005',
      nominee_id: 'emp_006',
      nominee_manager_id: 'emp_005',
      nominee_geo: 'US',
      nominee_department: 'Engineering',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pool.pool_type).toBe('manager_tier1')
    expect(r.pool.owner_id).toBe('emp_005')
  })

  it('Tier 2 → {department, geo} dept pool', async () => {
    await seedActive()
    const r = await resolvePoolForNomination({
      nomination_id: 'nom_3',
      current_tier: 2,
      nominator_id: 'emp_007',
      nominee_id: 'emp_006',
      nominee_manager_id: 'emp_005',
      nominee_geo: 'US',
      nominee_department: 'Engineering',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pool.pool_type).toBe('department_tier2')
    expect(r.pool.department).toBe('Engineering')
    expect(r.pool.geo).toBe('US')
  })

  it('Tier 2 without department → missing_department', async () => {
    await seedActive()
    const r = await resolvePoolForNomination({
      nomination_id: 'nom_4',
      current_tier: 2,
      nominator_id: 'emp_007',
      nominee_id: 'emp_001',
      nominee_manager_id: null,
      nominee_geo: 'US',
      nominee_department: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('missing_department')
  })

  it('Tier 3 → single committee pool', async () => {
    await seedActive()
    const r = await resolvePoolForNomination({
      nomination_id: 'nom_5',
      current_tier: 3,
      nominator_id: 'emp_007',
      nominee_id: 'emp_006',
      nominee_manager_id: 'emp_005',
      nominee_geo: 'US',
      nominee_department: 'Engineering',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pool.pool_type).toBe('committee_tier3')
    expect(r.pool.geo).toBeNull()
  })

  it('returns no_active_period when nothing is active', async () => {
    // No seed — empty budget state.
    const r = await resolvePoolForNomination({
      nomination_id: 'nom_6',
      current_tier: 1,
      nominator_id: 'emp_007',
      nominee_id: 'emp_006',
      nominee_manager_id: 'emp_005',
      nominee_geo: 'US',
      nominee_department: 'Engineering',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('no_active_period')
  })
})

describe('getReservePool', () => {
  it('finds the reserve pool for a period', async () => {
    const periodId = await seedActive()
    const r = await getReservePool(periodId)
    expect(r?.pool_type).toBe('reserve')
  })
})

/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { computePools } from '@/modules/budget/allocation'
import {
  DEFAULT_ALLOCATION_CONFIG,
  type BudgetPeriodRecord,
} from '@/modules/budget/types'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

function makePeriod(total: number): BudgetPeriodRecord {
  return {
    id: 'bp_test',
    period_label: 'Q2 2026',
    start_date: new Date('2026-04-01'),
    end_date: new Date('2026-06-30'),
    total_allocation_usd: total,
    status: 'draft',
    approved_by: [],
    approved_at: null,
    allocation_config: DEFAULT_ALLOCATION_CONFIG,
    closed_at: null,
  }
}

// Mock data headcount reminder (active only):
//   US       — 6 (Flora, Rubina, Sakshi, Sarah, Alex, Jamie); Rares = CEO
//   India    — 2 (Priya, Arjun)
//   Colombia — 2 (Carlos, Valentina)
//   + Rares is active, US, no department → 7 active in US total.
//
// Active employees (after subtracting the inactive System): Rares is active,
// so US active = 7. India = 2, Colombia = 2. Total = 11.

describe('computePools (spec §10.1, dynamic headcount)', () => {
  const activeEmployees = MOCK_EMPLOYEES.filter((e) => e.active)

  it('carves Tier 3 and reserve off the top by percentage', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)

    const tier3 = pools.find((p) => p.pool_type === 'committee_tier3')!
    const reserve = pools.find((p) => p.pool_type === 'reserve')!
    expect(tier3.allocated_amount_usd).toBe(15_000) // 15%
    expect(reserve.allocated_amount_usd).toBe(10_000) // 10%
  })

  it('splits remainder across geos proportional to active headcount', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)

    // After 25% off the top, 75% = $75,000 splits across geos by headcount.
    // US has 7 of 11 active; India 2; Colombia 2.
    const byGeo = new Map<string, number>()
    for (const p of pools) {
      if (p.pool_type === 'committee_tier3' || p.pool_type === 'reserve') continue
      if (!p.geo) continue
      byGeo.set(p.geo, (byGeo.get(p.geo) ?? 0) + p.allocated_amount_usd)
    }
    const us = byGeo.get('US') ?? 0
    const india = byGeo.get('India') ?? 0
    const colombia = byGeo.get('Colombia') ?? 0

    // Ratio check with small tolerance for rounding of sub-pools.
    expect(us / 75_000).toBeCloseTo(7 / 11, 2)
    expect(india / 75_000).toBeCloseTo(2 / 11, 2)
    expect(colombia / 75_000).toBeCloseTo(2 / 11, 2)
  })

  it('creates one manager Tier 1 pool per manager in the geo', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)

    const mgrPools = pools.filter((p) => p.pool_type === 'manager_tier1')
    const ownerIds = new Set(mgrPools.map((p) => p.owner_id!))
    // Managers in mock data: Rares (emp_001), Flora (emp_002), Sarah
    // (emp_005), Priya (emp_008), Carlos (emp_010). All have at least one
    // active direct report.
    expect(ownerIds.size).toBe(5)
    expect(ownerIds).toContain('emp_005')
    expect(ownerIds).toContain('emp_008')
    expect(ownerIds).toContain('emp_010')
  })

  it('sizes manager pools proportionally to direct-reports count within geo', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)

    // In US: Rares (emp_001) has 4 direct reports (Flora, Sarah, Priya,
    // Carlos — but only Flora and Sarah are US; India/Colombia reports
    // still count toward the total per the algorithm), Flora (emp_002)
    // has 2, Sarah (emp_005) has 2. Total US manager reports = 8.
    // Sarah's share of US manager pool = 2/8 = 25%.
    const usMgrs = pools.filter(
      (p) => p.pool_type === 'manager_tier1' && p.geo === 'US'
    )
    const usMgrTotal = usMgrs.reduce((s, p) => s + p.allocated_amount_usd, 0)
    const sarah = usMgrs.find((p) => p.owner_id === 'emp_005')!
    expect(sarah.allocated_amount_usd / usMgrTotal).toBeCloseTo(2 / 8, 2)
  })

  it('creates one peer Tier 1 pool per geo with active employees', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)

    const peerPools = pools.filter((p) => p.pool_type === 'peer_tier1')
    const geos = peerPools.map((p) => p.geo)
    expect(geos).toEqual(expect.arrayContaining(['US', 'India', 'Colombia']))
  })

  it('creates one dept Tier 2 pool per {department, geo} with active headcount', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)

    const deptPools = pools.filter((p) => p.pool_type === 'department_tier2')
    const keys = deptPools.map((p) => `${p.geo}/${p.department}`)
    // US has Engineering + People. India has Engineering. Colombia has
    // Operations. Rares (CEO) has no department so doesn't contribute.
    expect(keys).toEqual(
      expect.arrayContaining([
        'US/Engineering',
        'US/People',
        'India/Engineering',
        'Colombia/Operations',
      ])
    )
  })

  it('skips geos with zero active employees', () => {
    const period = makePeriod(100_000)
    const onlyUS = activeEmployees.filter((e) => e.geo === 'US')
    const pools = computePools(period, onlyUS, DEFAULT_ALLOCATION_CONFIG)

    const nonUS = pools.filter(
      (p) => p.geo !== null && p.geo !== 'US' && p.pool_type !== 'committee_tier3'
    )
    expect(nonUS).toHaveLength(0)
  })

  it('rounds all pool amounts to two decimal places', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)
    for (const p of pools) {
      // Allow tiny float imprecision from 2-decimal rounding.
      expect(p.allocated_amount_usd).toBeCloseTo(
        Math.round(p.allocated_amount_usd * 100) / 100,
        2
      )
    }
  })

  it('initializes spent and reserved to zero; remaining equals allocated', () => {
    const period = makePeriod(100_000)
    const pools = computePools(period, activeEmployees, DEFAULT_ALLOCATION_CONFIG)
    for (const p of pools) {
      expect(p.spent_amount_usd).toBe(0)
      expect(p.reserved_amount_usd).toBe(0)
      expect(p.remaining_amount_usd).toBe(p.allocated_amount_usd)
    }
  })
})

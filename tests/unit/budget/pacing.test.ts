/** @jest-environment node */
import { computePacing } from '@/modules/budget/pacing'
import type {
  BudgetPeriodRecord,
  BudgetPoolRecord,
} from '@/modules/budget/types'

function makePeriod(start: Date, end: Date): BudgetPeriodRecord {
  return {
    id: 'bp',
    period_label: 'Q',
    start_date: start,
    end_date: end,
    total_allocation_usd: 100_000,
    status: 'active',
    approved_by: [],
    approved_at: null,
    allocation_config: null,
    closed_at: null,
  }
}

function makePool(allocated: number, spent: number): BudgetPoolRecord {
  return {
    id: 'pool',
    period_id: 'bp',
    pool_type: 'peer_tier1',
    geo: 'US',
    owner_id: null,
    department: null,
    allocated_amount_usd: allocated,
    spent_amount_usd: spent,
    reserved_amount_usd: 0,
    remaining_amount_usd: allocated - spent,
  }
}

// 100-day period; check pacing at the 50-day midpoint.
const start = new Date('2026-04-01')
const end = new Date('2026-07-10')
const midpoint = new Date('2026-05-21')

describe('computePacing', () => {
  it('flags running_hot when spend is more than +15% over elapsed', () => {
    const pool = makePool(1000, 700) // 70% spent at 50% elapsed
    expect(computePacing({ pool, period: makePeriod(start, end), now: midpoint })).toBe(
      'running_hot'
    )
  })

  it('flags under_utilized when spend is more than -20% under elapsed', () => {
    const pool = makePool(1000, 100) // 10% spent at 50% elapsed = -40% drift
    expect(computePacing({ pool, period: makePeriod(start, end), now: midpoint })).toBe(
      'under_utilized'
    )
  })

  it('flags on_track inside the asymmetric bands', () => {
    const pool = makePool(1000, 500) // 50% spent at 50% elapsed
    expect(computePacing({ pool, period: makePeriod(start, end), now: midpoint })).toBe(
      'on_track'
    )
  })

  it('handles zero-allocation pools without dividing by zero', () => {
    const pool = makePool(0, 0)
    expect(computePacing({ pool, period: makePeriod(start, end), now: midpoint })).toBe(
      'on_track'
    )
  })

  it('clamps elapsed to 1 after the period ends', () => {
    const pool = makePool(1000, 1000) // fully spent
    const afterEnd = new Date('2026-08-01')
    expect(computePacing({ pool, period: makePeriod(start, end), now: afterEnd })).toBe(
      'on_track'
    )
  })
})

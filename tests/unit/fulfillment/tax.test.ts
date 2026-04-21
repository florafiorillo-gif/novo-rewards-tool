/** @jest-environment node */
import {
  PLACEHOLDER_RATES,
  computeCashGrossUp,
  computeNonCash,
} from '@/modules/fulfillment/tax'

describe('computeCashGrossUp (placeholder rates)', () => {
  it('grosses up US cash at ~30% — $100 net costs program ~$142.86', () => {
    const r = computeCashGrossUp({ geo: 'US', net_to_recipient_usd: 100 })
    expect(r.gross_up_rate_pct).toBe(PLACEHOLDER_RATES.US)
    expect(r.net_to_recipient_usd).toBe(100)
    expect(r.cost_to_program_usd).toBeCloseTo(100 / (1 - 30 / 100), 2)
    expect(r.placeholder).toBe(true)
  })

  it('grosses up India cash at ~35%', () => {
    const r = computeCashGrossUp({ geo: 'India', net_to_recipient_usd: 200 })
    expect(r.gross_up_rate_pct).toBe(PLACEHOLDER_RATES.India)
    expect(r.cost_to_program_usd).toBeGreaterThan(r.net_to_recipient_usd)
  })

  it('grosses up Colombia cash at ~30%', () => {
    const r = computeCashGrossUp({ geo: 'Colombia', net_to_recipient_usd: 150 })
    expect(r.gross_up_rate_pct).toBe(PLACEHOLDER_RATES.Colombia)
  })

  it('returns zeros for zero net', () => {
    const r = computeCashGrossUp({ geo: 'US', net_to_recipient_usd: 0 })
    expect(r.net_to_recipient_usd).toBe(0)
    expect(r.cost_to_program_usd).toBe(0)
  })

  it('rounds to two decimal places', () => {
    const r = computeCashGrossUp({ geo: 'US', net_to_recipient_usd: 123.45 })
    expect(r.net_to_recipient_usd).toBe(123.45)
    expect(r.cost_to_program_usd).toBeCloseTo(123.45 / 0.7, 2)
  })
})

describe('computeNonCash', () => {
  it('passes through amount (v1 assumes under-threshold, not taxable)', () => {
    const r = computeNonCash({ geo: 'US', amount_usd: 75 })
    expect(r.net_to_recipient_usd).toBe(75)
    expect(r.cost_to_program_usd).toBe(75)
    expect(r.gross_up_rate_pct).toBe(0)
  })
})

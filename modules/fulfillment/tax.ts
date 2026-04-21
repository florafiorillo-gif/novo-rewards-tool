import type { Geo } from '@/modules/employees/types'
import type { TaxCalculation } from '@/modules/rewards/types'

// Spec §8.3. These are PLACEHOLDER rates until Finance delivers the actual
// per-geo gross-up table. The reward selection UI displays a visible
// "rates pending Finance confirmation" note so approvers understand the
// numbers are indicative.
//
// Rationale for placeholder values (approximate blended effective rates):
//   US       ~30% — federal + average state + FICA
//   India    ~35% — highest personal income slab plus cess
//   Colombia ~30% — employee + dependent + solidarity
// Revisit when Finance confirms (spec §15 — Per-geo tax gross-up rates).

const PLACEHOLDER_GROSS_UP_PCT: Record<Geo, number> = {
  US: 30,
  India: 35,
  Colombia: 30,
}

// Non-cash rewards under local thresholds are typically not taxable to
// the recipient per spec §8.3. Phase 5 treats all non-cash as pass-through
// (net = cost); Finance will refine the thresholds pre-launch.
export function computeCashGrossUp(args: {
  geo: Geo
  net_to_recipient_usd: number
}): TaxCalculation {
  if (args.net_to_recipient_usd <= 0) {
    return {
      geo: args.geo,
      net_to_recipient_usd: 0,
      cost_to_program_usd: 0,
      gross_up_rate_pct: PLACEHOLDER_GROSS_UP_PCT[args.geo],
      placeholder: true,
    }
  }
  const ratePct = PLACEHOLDER_GROSS_UP_PCT[args.geo]
  // Gross-up formula: cost = net / (1 − rate). Recipient receives `net`,
  // program pays `cost` because taxes come out of the gross amount.
  const denom = 1 - ratePct / 100
  const cost = args.net_to_recipient_usd / denom
  return {
    geo: args.geo,
    net_to_recipient_usd: Math.round(args.net_to_recipient_usd * 100) / 100,
    cost_to_program_usd: Math.round(cost * 100) / 100,
    gross_up_rate_pct: ratePct,
    placeholder: true,
  }
}

// For non-cash rewards, v1 assumes under-threshold (not taxable). Returns
// a pass-through calc so the reward screen has a uniform shape.
export function computeNonCash(args: {
  geo: Geo
  amount_usd: number
}): TaxCalculation {
  return {
    geo: args.geo,
    net_to_recipient_usd: Math.round(args.amount_usd * 100) / 100,
    cost_to_program_usd: Math.round(args.amount_usd * 100) / 100,
    gross_up_rate_pct: 0,
    placeholder: true,
  }
}

// Exported for tests + the UI banner.
export const PLACEHOLDER_RATES = PLACEHOLDER_GROSS_UP_PCT

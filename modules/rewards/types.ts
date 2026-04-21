import type { Geo } from '@/modules/employees/types'

export type RewardType = 'cash' | 'gift_card' | 'experience' | 'l_and_d' | 'custom'

export type RewardStatus =
  | 'selected'
  | 'selected_pending_confirm'
  | 'issued'
  | 'delivered'
  | 'failed'
  | 'unclaimed'

export type DeliveryMechanism =
  | 'tremendous'
  | 'justworks_csv'
  | 'zoho_payroll'
  | 'manual'

export interface RewardRecord {
  id: string
  nomination_id: string
  reward_type: RewardType
  vendor: string | null
  amount_usd: number
  amount_local: number | null
  currency_local: string | null
  status: RewardStatus
  delivery_mechanism: DeliveryMechanism
  scope_note_template_id: string | null
  scope_note_text: string | null
  issued_at: Date | null
  delivered_at: Date | null
  // Exception-path flag: set when this reward was drawn from reserve
  // instead of the primary pool. Captured here for the Reward read path;
  // the canonical record is on BudgetException.
  budget_exception: boolean
  created_at: Date
}

// ─── Input shapes ────────────────────────────────────────────────────────────

export interface SelectRewardInput {
  nomination_id: string
  actor_id: string
  catalog_item_id: string | null // null when choosing cash or custom
  custom: {
    reward_type: RewardType
    amount_usd: number
    description?: string
  } | null
  scope_note_template_id: string | null
  scope_note_text: string
  budget_exception: boolean
  // For Tier 2: set pending_confirm instead of selected so the People
  // team rep must sign off before it commits.
  pending_confirm?: boolean
}

export type SelectRewardError =
  | { code: 'nomination_not_found' }
  | { code: 'nomination_wrong_status' }
  | { code: 'reward_already_selected' }
  | { code: 'no_active_period' }
  | { code: 'period_lapsed' }
  | { code: 'catalog_item_not_found' }
  | { code: 'catalog_geo_mismatch' }
  | { code: 'amount_out_of_range'; min: number; max: number }
  | { code: 'scope_note_required' }
  | { code: 'insufficient_balance'; remaining: number }
  | { code: 'invalid_amount' }
  | { code: 'forbidden' }

export type SelectRewardResult =
  | { ok: true; reward: RewardRecord }
  | { ok: false; error: SelectRewardError }

// ─── Confirm (Tier 2 People team rep sign-off) ───────────────────────────────

export interface ConfirmRewardInput {
  reward_id: string
  actor_id: string
}

export type ConfirmRewardError =
  | { code: 'not_found' }
  | { code: 'wrong_status' }
  | { code: 'forbidden' }
  | { code: 'no_active_period' }
  | { code: 'insufficient_balance'; remaining: number }

export type ConfirmRewardResult =
  | { ok: true; reward: RewardRecord }
  | { ok: false; error: ConfirmRewardError }

// ─── Fulfillment-state transitions ──────────────────────────────────────────

export interface IssueRewardInput {
  reward_id: string
  vendor_reference_id: string | null
}

export interface MarkRewardDeliveredInput {
  reward_id: string
  actor_id?: string
  now?: Date
}

export interface MarkRewardFailedInput {
  reward_id: string
  reason: string
}

export type FulfillmentResult =
  | { ok: true; reward: RewardRecord }
  | { ok: false; error: { code: 'not_found' | 'wrong_status' } }

// ─── Tax display ─────────────────────────────────────────────────────────────

export interface TaxCalculation {
  geo: Geo
  net_to_recipient_usd: number
  cost_to_program_usd: number
  gross_up_rate_pct: number
  placeholder: true // flag until Finance delivers real rates
}

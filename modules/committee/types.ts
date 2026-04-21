export type CommitteeDecisionType = 'approve' | 'deny' | 'defer'

// Mirrors Prisma CommitteeDecision model (spec §12.9). Reward-related fields
// are null through Phase 3; Phase 5 populates approved_amount_usd +
// reward_form + delivery_plan.
export interface CommitteeDecisionRecord {
  id: string
  nomination_id: string | null
  team_award_group_id: string | null
  committee_members: string[]
  decision: CommitteeDecisionType
  approved_amount_usd: number | null
  reward_form: string | null
  delivery_plan: string | null
  decision_log_text: string | null
  conflicted_members: string[]
  substitute_member_id: string | null
  delivered_by_id: string | null
  delivered_at: Date | null
  decided_at: Date
}

export interface CommitteeDecideInput {
  nomination_id: string
  actor_id: string
  decision: CommitteeDecisionType
  decision_log_text: string
  // Concurring members who were in the room; defaults to [actor_id].
  concurring_member_ids?: string[]
  // Reward fields — required when decision='approve' (spec §7.5).
  // Committee picks amount + form + delivery plan inline, and the budget
  // commit fires as part of the decide call.
  reward?: {
    reward_type:
      | 'cash'
      | 'gift_card'
      | 'experience'
      | 'l_and_d'
      | 'custom'
    amount_usd: number
    delivery_plan: string
    scope_note_text: string
    scope_note_template_id?: string
  }
}

export type CommitteeDecideError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'wrong_status' }
  | { code: 'recused' }
  | { code: 'decision_log_required' }
  | { code: 'reward_required_on_approve' }
  | { code: 'reward_amount_out_of_range'; min: number; max: number }
  | { code: 'delivery_plan_required' }
  | { code: 'insufficient_balance'; remaining: number }
  | { code: 'no_active_period' }

export type CommitteeDecideResult =
  | {
      ok: true
      decision: CommitteeDecisionRecord
      // For 'approve': 'approved'. For 'deny': 'returned_to_tier_2'. For 'defer': 'deferred'.
      outcome: 'approved' | 'returned_to_tier_2' | 'deferred'
    }
  | { ok: false; error: CommitteeDecideError }

export interface RecuseInput {
  nomination_id: string
  actor_id: string
}

export type RecuseError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'already_recused' }
  | { code: 'wrong_status' }

export type RecuseResult =
  | { ok: true }
  | { ok: false; error: RecuseError }

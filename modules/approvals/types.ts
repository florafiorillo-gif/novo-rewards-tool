import type { NominationRecord } from '@/modules/nominations/types'

export type ReflectionType =
  | 'FIRST_RECOGNITION'
  | 'SPECIFIC_MOMENT'
  | 'BROADER_PATTERN'
  | 'OTHER'

export type ApprovalActionType =
  | 'approve'
  | 'deny'
  | 'propose_upgrade'
  | 'escalate'
  | 'request_info'
  | 'recuse'
  | 'group_into_team_award'
  | 'undo'

export type DenialReason =
  | 'failed_loophole'
  | 'value_mismatch'
  | 'already_recognized'
  | 'insufficient_detail'
  | 'other'

export interface ApprovalActionRecord {
  id: string
  nomination_id: string
  actor_id: string
  action: ApprovalActionType
  from_tier: number | null
  to_tier: number | null
  reason_structured: DenialReason | null
  reason_text: string | null
  reflection_type: ReflectionType | null
  created_at: Date
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export interface ApproveInput {
  nomination_id: string
  actor_id: string
  // Required when actor == nominator == nominee's manager (self-approval, §7.2).
  reflection_type?: ReflectionType
}

export type ApproveError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'wrong_status' }
  | { code: 'reflection_required' }
  | { code: 'reflection_not_allowed' }

export type ApproveResult =
  | {
      ok: true
      nomination: NominationRecord
      action: ApprovalActionRecord
      // True if this call transitioned status to approved. False for the
      // first of two Tier 2 approvers (still under_review).
      became_final: boolean
    }
  | { ok: false; error: ApproveError }

// ─── Deny ────────────────────────────────────────────────────────────────────

export interface DenyInput {
  nomination_id: string
  actor_id: string
  reason_structured: DenialReason
  reason_text: string
}

export type DenyError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'wrong_status' }
  | { code: 'reason_text_required' }

export type DenyResult =
  | {
      ok: true
      nomination: NominationRecord
      action: ApprovalActionRecord
      // 'denied' (Tier 1), 'returned_to_tier_1' (Tier 2 deny drops to T1 queue),
      // 'returned_to_tier_2' (Tier 3 deny drops back to T2 queue).
      outcome: 'denied' | 'returned_to_tier_1' | 'returned_to_tier_2'
    }
  | { ok: false; error: DenyError }

// ─── Propose upgrade / escalate ──────────────────────────────────────────────

export interface ProposeUpgradeInput {
  nomination_id: string
  actor_id: string
  to_tier: 2 | 3
  reasoning: string
  urgent?: boolean
}

export type ProposeUpgradeError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'wrong_status' }
  | { code: 'invalid_tier_transition' }
  | { code: 'reasoning_required' }
  | { code: 'no_department_head' }
  | { code: 'no_people_team_rep' }

export type ProposeUpgradeResult =
  | {
      ok: true
      nomination: NominationRecord
      action: ApprovalActionRecord
    }
  | { ok: false; error: ProposeUpgradeError }

// ─── Undo (spec §13.3, 10-minute window) ─────────────────────────────────────

export interface UndoInput {
  nomination_id: string
  actor_id: string
  now?: Date
}

export type UndoError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'nothing_to_undo' }
  | { code: 'window_expired' }

export type UndoResult =
  | { ok: true; nomination: NominationRecord; action: ApprovalActionRecord }
  | { ok: false; error: UndoError }

// ─── Request more info (logs only, no state change) ──────────────────────────

export interface RequestInfoInput {
  nomination_id: string
  actor_id: string
  question: string
}

export type RequestInfoError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'wrong_status' }
  | { code: 'question_required' }

export type RequestInfoResult =
  | { ok: true; action: ApprovalActionRecord }
  | { ok: false; error: RequestInfoError }

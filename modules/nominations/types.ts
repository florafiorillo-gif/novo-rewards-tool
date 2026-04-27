import type { ZodIssue } from 'zod'

// Mirrors NominationStatus enum in prisma/schema.prisma (spec §12.5).
export type NominationStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'denied'
  | 'fulfilled'
  | 'cancelled'

// In-memory / DB-shaped record used by service + mock store.
// Field names match the Prisma model so DB and mock paths are symmetric.
export interface NominationRecord {
  id: string
  nominator_id: string
  nominee_id: string
  value_id: string
  behavior_text: string
  outcome_text: string
  evidence_links: string[]
  submitted_at: Date
  current_tier: number
  status: NominationStatus
  current_approver_id: string | null
  team_award_group_id: string | null
  duplicate_of_id: string | null
  tier2_dept_head_id: string | null
  tier2_people_team_rep_id: string | null
  urgent: boolean
  last_nudge_at: Date | null
  last_escalation_at: Date | null
  approved_at: Date | null
  denied_at: Date | null
  // Phase 6B/6C — set when recipient acknowledges and when #made-it-happen
  // post fires, respectively. Both null until the fulfillment stage.
  acknowledged_at: Date | null
  post_fired_at: Date | null
  post_message_ts: string | null
  created_at: Date
  updated_at: Date
}

export interface RoutingResult {
  current_approver_id: string | null
  requires_people_team_assignment: boolean
}

export type CreateNominationError =
  | { code: 'validation'; issues: ZodIssue[] }
  | { code: 'self_nomination' }
  | { code: 'nominee_not_found' }
  | { code: 'nominee_inactive' }
  | { code: 'nominator_not_found' }
  | { code: 'value_not_found' }

export type CreateNominationResult =
  | {
      ok: true
      nomination: NominationRecord
      routed_to_people_team: boolean
      duplicate_of_id: string | null
    }
  | { ok: false; error: CreateNominationError }

export type CancelNominationError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'not_cancellable' }
  | { code: 'window_expired' }

export type CancelNominationResult =
  | { ok: true; nomination: NominationRecord }
  | { ok: false; error: CancelNominationError }

// ─── Group nominations (Round 3) ────────────────────────────────────
// Single submission, multiple recipients. Fans out into N independent
// nominations sharing a team_award_group_id. Length-1 input falls
// through to the standard single-recipient path with no group_id.

export type CreateGroupNominationError =
  | { code: 'validation'; issues: ZodIssue[] }
  | { code: 'self_nomination' }
  | { code: 'nominator_not_found' }
  | { code: 'value_not_found' }
  // No active or candidate recipients survived validation — every
  // nominee was missing from the directory or inactive. Form should
  // tell the user to pick again.
  | { code: 'no_recipients_remaining' }
  // Group nominations don't allow self-approval mixing in v1: if any
  // recipient is the nominator's direct report, ask them to submit
  // that one separately (the single-recipient path handles the
  // self-approval reflection inline).
  | { code: 'self_approval_in_group' }

export type CreateGroupNominationResult =
  | {
      ok: true
      // null when only one nomination was created (single-recipient
      // form submission); a `grp_<uuid>` string when N >= 2.
      group_id: string | null
      nominations: NominationRecord[]
      // Recipients who were silently dropped at submission time. UI
      // shows a "we skipped these" notice next to the confirmation.
      excluded_inactive_ids: string[]
      excluded_missing_ids: string[]
    }
  | { ok: false; error: CreateGroupNominationError }

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

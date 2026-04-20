import type { Geo } from '@/modules/employees/types'

// Mirrors the Prisma PoolType enum.
export type PoolType =
  | 'manager_tier1'
  | 'peer_tier1'
  | 'department_tier2'
  | 'committee_tier3'
  | 'reserve'

export type BudgetPeriodStatus = 'draft' | 'approved' | 'active' | 'closed'

// Split config stored on BudgetPeriod.allocation_config (JSON). These are
// v1 defaults; the committee adjusts per quarter. See rewards_tool_spec.md
// §10.1 for the structure — Tier 3 + reserve come off the program total
// first; the remainder splits across geo pools by active headcount; within
// each geo the three sub-pools split by within_geo percentages.
export interface AllocationConfig {
  tier3_pct: number
  reserve_pct: number
  within_geo: {
    manager_tier1_pct: number
    peer_tier1_pct: number
    dept_tier2_pct: number
  }
}

export const DEFAULT_ALLOCATION_CONFIG: AllocationConfig = {
  tier3_pct: 15,
  reserve_pct: 10,
  within_geo: {
    manager_tier1_pct: 50,
    peer_tier1_pct: 20,
    dept_tier2_pct: 30,
  },
}

// Grace window after closed_at during which pools remain drawable for
// in-flight approvals (spec §10.4 + Phase 4 decision). Phase 5 reward-
// selection enforces the lapse check at commit time.
export const CLOSE_GRACE_MS = 14 * 24 * 60 * 60 * 1000

export interface BudgetPeriodRecord {
  id: string
  period_label: string
  start_date: Date
  end_date: Date
  total_allocation_usd: number
  status: BudgetPeriodStatus
  approved_by: string[]
  approved_at: Date | null
  allocation_config: AllocationConfig | null
  closed_at: Date | null
}

export interface BudgetPoolRecord {
  id: string
  period_id: string
  pool_type: PoolType
  geo: Geo | null
  owner_id: string | null
  department: string | null
  allocated_amount_usd: number
  spent_amount_usd: number
  reserved_amount_usd: number
  remaining_amount_usd: number
}

export interface BudgetExceptionRecord {
  id: string
  nomination_id: string
  pool_id: string
  amount_usd: number
  approver_id: string
  reason_text: string | null
  created_at: Date
}

// ─── Allocation ──────────────────────────────────────────────────────────────

export interface AllocationResult {
  period_id: string
  pools: BudgetPoolRecord[]
  // Per-geo headcount snapshot taken at allocation time (spec §10.1 —
  // dynamic from Employee, never hardcoded).
  headcount_by_geo: Record<Geo, number>
}

export type AllocationError =
  | { code: 'period_not_found' }
  | { code: 'wrong_status'; status: BudgetPeriodStatus }
  | { code: 'no_active_employees' }
  | { code: 'invalid_config'; reason: string }

export type AllocationOutcome =
  | { ok: true; result: AllocationResult }
  | { ok: false; error: AllocationError }

// ─── Period lifecycle ────────────────────────────────────────────────────────

export interface CreatePeriodInput {
  period_label: string
  start_date: Date
  end_date: Date
  total_allocation_usd: number
  allocation_config?: AllocationConfig
}

export type PeriodError =
  | { code: 'not_found' }
  | { code: 'wrong_status'; status: BudgetPeriodStatus }
  | { code: 'forbidden' }
  | { code: 'invalid_dates' }
  | { code: 'invalid_amount' }
  | { code: 'not_all_committee_approved' }

export type PeriodResult<T = BudgetPeriodRecord> =
  | { ok: true; period: T }
  | { ok: false; error: PeriodError }

// ─── Pool primitives ─────────────────────────────────────────────────────────

export interface CommitSpendInput {
  pool_id: string
  amount_usd: number
  // Optional — captured on BudgetException when drawing from reserve.
  nomination_id?: string
  approver_id?: string
}

export type CommitSpendError =
  | { code: 'pool_not_found' }
  | { code: 'invalid_amount' }
  | { code: 'insufficient_balance'; remaining: number }

export type CommitSpendResult =
  | { ok: true; pool: BudgetPoolRecord }
  | { ok: false; error: CommitSpendError }

// ─── Routing ─────────────────────────────────────────────────────────────────

export interface NominationRoutingContext {
  nomination_id: string
  current_tier: 1 | 2 | 3
  nominator_id: string
  nominee_id: string
  // Manager of the nominee, for "is this a manager-initiated Tier 1?" check.
  nominee_manager_id: string | null
  nominee_geo: Geo
  nominee_department: string | null
}

export type PoolResolutionError =
  | { code: 'no_active_period' }
  | { code: 'no_pool_for_tier'; tier: number }
  | { code: 'missing_department' }
  | { code: 'missing_manager_pool'; manager_id: string }
  | { code: 'missing_dept_pool'; department: string; geo: Geo }
  | { code: 'missing_peer_pool'; geo: Geo }

export type PoolResolutionResult =
  | { ok: true; pool: BudgetPoolRecord }
  | { ok: false; error: PoolResolutionError }

// ─── Pacing ──────────────────────────────────────────────────────────────────

export type PacingIndicator = 'under_utilized' | 'on_track' | 'running_hot'

export interface PacingInput {
  pool: BudgetPoolRecord
  period: BudgetPeriodRecord
  now?: Date
}

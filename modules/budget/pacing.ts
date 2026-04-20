import type { PacingIndicator, PacingInput } from './types'

// Spec §10.5 — managers see their own pool + a program health indicator
// (on track / running hot / under-utilized). Computed here so Phase 5 can
// surface it at reward-selection and Phase 7 dashboards can render badges.
//
// Asymmetric thresholds: overspending is what we want to catch early, so
// "running hot" trips at +15% over pace; "under utilized" trips at -20%
// under pace because slow ramp-in is usually fine. Revisit with real data.

const HOT_THRESHOLD = 0.15
const UNDER_THRESHOLD = -0.2

export function computePacing(input: PacingInput): PacingIndicator {
  const { pool, period } = input
  const now = input.now ?? new Date()

  // Degenerate pools (no allocation) can't be paced meaningfully; treat
  // as on_track rather than divide-by-zero.
  if (pool.allocated_amount_usd <= 0) return 'on_track'

  const periodMs = period.end_date.getTime() - period.start_date.getTime()
  if (periodMs <= 0) return 'on_track'

  // Clamp elapsed to [0, 1] — pacing before the period starts is 0 (all
  // spend would count as "hot"), after the end is 1.
  const elapsed = Math.max(
    0,
    Math.min(1, (now.getTime() - period.start_date.getTime()) / periodMs)
  )
  const spentPct = pool.spent_amount_usd / pool.allocated_amount_usd

  const drift = spentPct - elapsed
  if (drift > HOT_THRESHOLD) return 'running_hot'
  if (drift < UNDER_THRESHOLD) return 'under_utilized'
  return 'on_track'
}

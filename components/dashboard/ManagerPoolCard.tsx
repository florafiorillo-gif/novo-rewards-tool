import type {
  BudgetPeriodRecord,
  BudgetPoolRecord,
  PacingIndicator,
} from '@/modules/budget/types'
import { PoolCard } from './PoolCard'

// Manager Tier 1 pool view. Spec §10.5 — managers see their own pool
// + a pacing chip. No cross-manager visibility. Shape matches the
// department-head pool view; the only difference is the eyebrow.
interface Props {
  period: BudgetPeriodRecord
  pool: BudgetPoolRecord
  pacing: PacingIndicator
  in_grace?: boolean
  grace_ends_at?: Date | null
}

export function ManagerPoolCard({
  period,
  pool,
  pacing,
  in_grace,
  grace_ends_at,
}: Props) {
  return (
    <PoolCard
      eyebrow={`Your pool · ${period.period_label}`}
      period_label={period.period_label}
      pool={pool}
      pacing={pacing}
      in_grace={in_grace}
      grace_ends_at={grace_ends_at}
    />
  )
}

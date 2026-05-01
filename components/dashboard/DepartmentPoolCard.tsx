import type {
  BudgetPeriodRecord,
  BudgetPoolRecord,
  PacingIndicator,
} from '@/modules/budget/types'
import type { Geo } from '@/modules/employees/types'
import { PoolCard } from './PoolCard'

// Department-head Tier 2 pool view. Same visual shape as the manager
// pool card; the eyebrow names the department + geo + period instead
// of "Your pool · {period}". Both wrap the shared PoolCard primitive
// in components/dashboard/PoolCard.tsx.
interface Props {
  department: string
  geo: Geo
  period: BudgetPeriodRecord
  pool: BudgetPoolRecord
  pacing: PacingIndicator
  in_grace?: boolean
  grace_ends_at?: Date | null
}

export function DepartmentPoolCard({
  department,
  geo,
  period,
  pool,
  pacing,
  in_grace,
  grace_ends_at,
}: Props) {
  return (
    <PoolCard
      eyebrow={`${department} · ${geo} · ${period.period_label}`}
      period_label={period.period_label}
      pool={pool}
      pacing={pacing}
      in_grace={in_grace}
      grace_ends_at={grace_ends_at}
    />
  )
}

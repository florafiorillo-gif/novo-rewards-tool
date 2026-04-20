import type {
  BudgetExceptionRecord,
  BudgetPeriodRecord,
  BudgetPoolRecord,
} from './types'

// In-memory Maps for USE_MOCK_DATA=true. State resets on server restart,
// which is fine for local dev; tests reset explicitly via the reset helpers.

const periods = new Map<string, BudgetPeriodRecord>()
const pools = new Map<string, BudgetPoolRecord>()
const exceptions = new Map<string, BudgetExceptionRecord>()

export function resetMockBudget(): void {
  periods.clear()
  pools.clear()
  exceptions.clear()
}

// ─── Periods ─────────────────────────────────────────────────────────────────

export function insertMockPeriod(record: BudgetPeriodRecord): BudgetPeriodRecord {
  periods.set(record.id, record)
  return record
}

export function findMockPeriodById(id: string): BudgetPeriodRecord | null {
  return periods.get(id) ?? null
}

export function listMockPeriods(): BudgetPeriodRecord[] {
  return [...periods.values()].sort(
    (a, b) => b.start_date.getTime() - a.start_date.getTime()
  )
}

export function updateMockPeriod(
  id: string,
  patch: Partial<BudgetPeriodRecord>
): BudgetPeriodRecord | null {
  const existing = periods.get(id)
  if (!existing) return null
  const updated = { ...existing, ...patch }
  periods.set(id, updated)
  return updated
}

export function findMockActivePeriod(now: Date = new Date()): BudgetPeriodRecord | null {
  // "Active" = status=active AND today falls inside [start, end]. If multiple
  // match (shouldn't happen but be safe), pick the one with the latest start.
  const candidates = [...periods.values()]
    .filter(
      (p) =>
        p.status === 'active' &&
        p.start_date.getTime() <= now.getTime() &&
        p.end_date.getTime() >= now.getTime()
    )
    .sort((a, b) => b.start_date.getTime() - a.start_date.getTime())
  return candidates[0] ?? null
}

// ─── Pools ───────────────────────────────────────────────────────────────────

export function insertMockPool(record: BudgetPoolRecord): BudgetPoolRecord {
  pools.set(record.id, record)
  return record
}

export function findMockPoolById(id: string): BudgetPoolRecord | null {
  return pools.get(id) ?? null
}

export function listMockPoolsForPeriod(period_id: string): BudgetPoolRecord[] {
  return [...pools.values()].filter((p) => p.period_id === period_id)
}

export function updateMockPool(
  id: string,
  patch: Partial<BudgetPoolRecord>
): BudgetPoolRecord | null {
  const existing = pools.get(id)
  if (!existing) return null
  const updated = { ...existing, ...patch }
  pools.set(id, updated)
  return updated
}

export function replaceMockPoolsForPeriod(
  period_id: string,
  records: BudgetPoolRecord[]
): void {
  // Allocation is idempotent per period: drop any existing pools for this
  // period and replace with the freshly-computed set.
  for (const [id, pool] of pools) {
    if (pool.period_id === period_id) pools.delete(id)
  }
  for (const rec of records) pools.set(rec.id, rec)
}

// ─── Exceptions ──────────────────────────────────────────────────────────────

export function insertMockException(
  record: BudgetExceptionRecord
): BudgetExceptionRecord {
  exceptions.set(record.id, record)
  return record
}

export function listMockExceptionsForPeriod(
  period_id: string
): BudgetExceptionRecord[] {
  const poolIdsForPeriod = new Set(
    [...pools.values()].filter((p) => p.period_id === period_id).map((p) => p.id)
  )
  return [...exceptions.values()]
    .filter((e) => poolIdsForPeriod.has(e.pool_id))
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
}

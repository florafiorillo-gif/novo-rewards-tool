import { db } from '@/lib/db'
import {
  findMockPoolById,
  listMockPoolsForPeriod,
  updateMockPool,
} from './mock-store'
import type {
  BudgetPoolRecord,
  CommitSpendInput,
  CommitSpendResult,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export async function getPool(id: string): Promise<BudgetPoolRecord | null> {
  if (useMock()) return findMockPoolById(id)
  const row = await db.budgetPool.findUnique({ where: { id } })
  return row ? hydrate(row) : null
}

export async function listPoolsForPeriod(
  period_id: string
): Promise<BudgetPoolRecord[]> {
  if (useMock()) return listMockPoolsForPeriod(period_id)
  const rows = await db.budgetPool.findMany({ where: { period_id } })
  return rows.map(hydrate)
}

export function getRemaining(pool: BudgetPoolRecord): number {
  return pool.allocated_amount_usd - pool.spent_amount_usd - pool.reserved_amount_usd
}

// ─── commitSpend — optimistic locking at commit (Phase 4 decision Q4) ────────
// No pre-reservation during approval/reward-selection. At the moment the
// approver confirms a specific reward (Phase 5), we do an atomic check-and-
// increment against spent_amount_usd. The rare race (two approvers confirm
// within the same millisecond and between them overflow the pool) surfaces
// as insufficient_balance; the losing approver sees a warm error and can
// retry via the exception path.

export async function commitSpend(
  input: CommitSpendInput
): Promise<CommitSpendResult> {
  if (input.amount_usd <= 0) {
    return { ok: false, error: { code: 'invalid_amount' } }
  }

  if (useMock()) {
    const pool = findMockPoolById(input.pool_id)
    if (!pool) return { ok: false, error: { code: 'pool_not_found' } }
    const remaining = getRemaining(pool)
    if (input.amount_usd > remaining) {
      return {
        ok: false,
        error: { code: 'insufficient_balance', remaining },
      }
    }
    const nextSpent = pool.spent_amount_usd + input.amount_usd
    const updated = updateMockPool(input.pool_id, {
      spent_amount_usd: nextSpent,
      remaining_amount_usd:
        pool.allocated_amount_usd - nextSpent - pool.reserved_amount_usd,
    })
    return { ok: true, pool: updated! }
  }

  // Conditional update: Postgres enforces the balance check inside the SQL
  // so two concurrent commits can't both pass. updateMany returns { count: 0 }
  // when the WHERE predicate fails, letting us surface insufficient_balance
  // without a transaction round-trip.
  const result = await db.budgetPool.updateMany({
    where: {
      id: input.pool_id,
      remaining_amount_usd: { gte: input.amount_usd },
    },
    data: {
      spent_amount_usd: { increment: input.amount_usd },
      remaining_amount_usd: { decrement: input.amount_usd },
    },
  })
  if (result.count === 0) {
    // Either the pool doesn't exist or it didn't have enough.
    const existing = await db.budgetPool.findUnique({ where: { id: input.pool_id } })
    if (!existing) return { ok: false, error: { code: 'pool_not_found' } }
    const hydrated = hydrate(existing)
    return {
      ok: false,
      error: { code: 'insufficient_balance', remaining: getRemaining(hydrated) },
    }
  }
  const updated = await db.budgetPool.findUniqueOrThrow({ where: { id: input.pool_id } })
  return { ok: true, pool: hydrate(updated) }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function hydrate(row: unknown): BudgetPoolRecord {
  const r = row as {
    id: string
    period_id: string
    pool_type: BudgetPoolRecord['pool_type']
    geo: BudgetPoolRecord['geo']
    owner_id: string | null
    department: string | null
    allocated_amount_usd: { toNumber(): number } | number
    spent_amount_usd: { toNumber(): number } | number
    reserved_amount_usd: { toNumber(): number } | number
    remaining_amount_usd: { toNumber(): number } | number
  }
  return {
    id: r.id,
    period_id: r.period_id,
    pool_type: r.pool_type,
    geo: r.geo,
    owner_id: r.owner_id,
    department: r.department,
    allocated_amount_usd: toNumber(r.allocated_amount_usd),
    spent_amount_usd: toNumber(r.spent_amount_usd),
    reserved_amount_usd: toNumber(r.reserved_amount_usd),
    remaining_amount_usd: toNumber(r.remaining_amount_usd),
  }
}

function toNumber(v: { toNumber(): number } | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'number' ? v : v.toNumber()
}

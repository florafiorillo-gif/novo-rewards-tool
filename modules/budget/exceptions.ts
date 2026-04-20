import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  insertMockException,
  listMockExceptionsForPeriod,
} from './mock-store'
import { commitSpend } from './pools'
import { getReservePool } from './routing'
import type {
  BudgetExceptionRecord,
  CommitSpendError,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §10.3 — pool exhausted → approver checks "budget exception,"
// reward paid from the reserve, exception logged. Phase 5 renders the UI;
// Phase 4 provides this primitive.

export type DrawFromReserveError =
  | { code: 'no_active_period' }
  | { code: 'no_reserve_pool' }
  | CommitSpendError

export type DrawFromReserveResult =
  | { ok: true; exception: BudgetExceptionRecord; reserve_remaining: number }
  | { ok: false; error: DrawFromReserveError }

export async function drawFromReserve(args: {
  period_id: string
  nomination_id: string
  amount_usd: number
  approver_id: string
  reason_text?: string
}): Promise<DrawFromReserveResult> {
  const reserve = await getReservePool(args.period_id)
  if (!reserve) return { ok: false, error: { code: 'no_reserve_pool' } }

  const spend = await commitSpend({
    pool_id: reserve.id,
    amount_usd: args.amount_usd,
    nomination_id: args.nomination_id,
    approver_id: args.approver_id,
  })
  if (!spend.ok) return { ok: false, error: spend.error }

  const exception: BudgetExceptionRecord = {
    id: `bex_${randomUUID()}`,
    nomination_id: args.nomination_id,
    pool_id: reserve.id,
    amount_usd: args.amount_usd,
    approver_id: args.approver_id,
    reason_text: args.reason_text ?? null,
    created_at: new Date(),
  }

  if (useMock()) {
    insertMockException(exception)
  } else {
    const created = await db.budgetException.create({
      data: {
        nomination_id: exception.nomination_id,
        pool_id: exception.pool_id,
        amount_usd: exception.amount_usd,
        approver_id: exception.approver_id,
        reason_text: exception.reason_text ?? undefined,
      },
    })
    exception.id = created.id
    exception.created_at = created.created_at
  }

  return {
    ok: true,
    exception,
    reserve_remaining: spend.pool.remaining_amount_usd,
  }
}

export async function listExceptionsForPeriod(
  period_id: string
): Promise<BudgetExceptionRecord[]> {
  if (useMock()) return listMockExceptionsForPeriod(period_id)
  const rows = await db.budgetException.findMany({
    where: { pool: { period_id } },
    orderBy: { created_at: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    nomination_id: r.nomination_id,
    pool_id: r.pool_id,
    amount_usd:
      typeof r.amount_usd === 'number'
        ? r.amount_usd
        : (r.amount_usd as { toNumber(): number }).toNumber(),
    approver_id: r.approver_id,
    reason_text: r.reason_text,
    created_at: r.created_at,
  }))
}

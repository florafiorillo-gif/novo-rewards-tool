import { db } from '@/lib/db'
import { listMockPoolsForPeriod } from './mock-store'
import { getActivePeriod } from './periods'
import type {
  BudgetPoolRecord,
  NominationRoutingContext,
  PoolResolutionResult,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §10.2. Peer Tier 1 → nominee's geo peer pool. Manager-initiated
// Tier 1 (nominator == nominee's manager) → manager's own pool. Tier 2 →
// {department, geo} pool. Tier 3 → single global committee pool.

export async function resolvePoolForNomination(
  ctx: NominationRoutingContext
): Promise<PoolResolutionResult> {
  const period = await getActivePeriod()
  if (!period) return { ok: false, error: { code: 'no_active_period' } }

  const pools = await listPoolsForPeriod(period.id)

  if (ctx.current_tier === 1) {
    return resolveTier1(ctx, pools)
  }
  if (ctx.current_tier === 2) {
    return resolveTier2(ctx, pools)
  }
  if (ctx.current_tier === 3) {
    return resolveTier3(pools)
  }
  return { ok: false, error: { code: 'no_pool_for_tier', tier: ctx.current_tier } }
}

function resolveTier1(
  ctx: NominationRoutingContext,
  pools: BudgetPoolRecord[]
): PoolResolutionResult {
  const isSelfApproval =
    ctx.nominee_manager_id !== null &&
    ctx.nominator_id === ctx.nominee_manager_id

  if (isSelfApproval) {
    // Manager-initiated: draws from the manager's own Tier 1 pool.
    const pool = pools.find(
      (p) => p.pool_type === 'manager_tier1' && p.owner_id === ctx.nominator_id
    )
    if (!pool) {
      return {
        ok: false,
        error: { code: 'missing_manager_pool', manager_id: ctx.nominator_id },
      }
    }
    return { ok: true, pool }
  }

  // Peer or skip-level: draws from nominee's geo peer pool (spec §10.2).
  const pool = pools.find(
    (p) => p.pool_type === 'peer_tier1' && p.geo === ctx.nominee_geo
  )
  if (!pool) {
    return { ok: false, error: { code: 'missing_peer_pool', geo: ctx.nominee_geo } }
  }
  return { ok: true, pool }
}

function resolveTier2(
  ctx: NominationRoutingContext,
  pools: BudgetPoolRecord[]
): PoolResolutionResult {
  if (!ctx.nominee_department) {
    return { ok: false, error: { code: 'missing_department' } }
  }
  const pool = pools.find(
    (p) =>
      p.pool_type === 'department_tier2' &&
      p.geo === ctx.nominee_geo &&
      p.department === ctx.nominee_department
  )
  if (!pool) {
    return {
      ok: false,
      error: {
        code: 'missing_dept_pool',
        department: ctx.nominee_department,
        geo: ctx.nominee_geo,
      },
    }
  }
  return { ok: true, pool }
}

function resolveTier3(pools: BudgetPoolRecord[]): PoolResolutionResult {
  const pool = pools.find((p) => p.pool_type === 'committee_tier3')
  if (!pool) {
    return { ok: false, error: { code: 'no_pool_for_tier', tier: 3 } }
  }
  return { ok: true, pool }
}

// ─── Reserve pool lookup ─────────────────────────────────────────────────────
// Used by the exception path when a primary pool is exhausted.

export async function getReservePool(
  period_id: string
): Promise<BudgetPoolRecord | null> {
  const pools = await listPoolsForPeriod(period_id)
  return pools.find((p) => p.pool_type === 'reserve') ?? null
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function listPoolsForPeriod(
  period_id: string
): Promise<BudgetPoolRecord[]> {
  if (useMock()) return listMockPoolsForPeriod(period_id)
  const rows = await db.budgetPool.findMany({ where: { period_id } })
  return rows.map(hydrate)
}

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

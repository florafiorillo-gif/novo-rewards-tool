import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import type { Employee, Geo } from '@/modules/employees/types'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'
import {
  findMockPeriodById,
  replaceMockPoolsForPeriod,
} from './mock-store'
import type {
  AllocationConfig,
  AllocationOutcome,
  BudgetPeriodRecord,
  BudgetPoolRecord,
  PoolType,
} from './types'
import { DEFAULT_ALLOCATION_CONFIG } from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

const GEOS: Geo[] = ['US', 'India', 'Colombia']

// ─── Public ──────────────────────────────────────────────────────────────────

export async function allocatePools(
  period_id: string,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG
): Promise<AllocationOutcome> {
  const configError = validateConfig(config)
  if (configError) return { ok: false, error: configError }

  const period = await loadPeriod(period_id)
  if (!period) return { ok: false, error: { code: 'period_not_found' } }
  if (period.status !== 'draft') {
    return { ok: false, error: { code: 'wrong_status', status: period.status } }
  }

  const employees = await loadActiveEmployees()
  if (employees.length === 0) {
    return { ok: false, error: { code: 'no_active_employees' } }
  }

  const pools = computePools(period, employees, config)

  if (useMock()) {
    replaceMockPoolsForPeriod(period.id, pools)
  } else {
    // One transaction so a partial failure doesn't leave inconsistent pools.
    await db.$transaction(async (tx) => {
      await tx.budgetPool.deleteMany({ where: { period_id: period.id } })
      for (const p of pools) {
        await tx.budgetPool.create({
          data: {
            id: p.id,
            period_id: p.period_id,
            pool_type: p.pool_type,
            geo: p.geo ?? undefined,
            owner_id: p.owner_id ?? undefined,
            department: p.department ?? undefined,
            allocated_amount_usd: p.allocated_amount_usd,
            spent_amount_usd: p.spent_amount_usd,
            reserved_amount_usd: p.reserved_amount_usd,
            remaining_amount_usd: p.remaining_amount_usd,
          },
        })
      }
    })
  }

  // Attach allocation_config to the period if the caller supplied a custom
  // one (vs. the default); leave it as-is otherwise.
  if (config !== DEFAULT_ALLOCATION_CONFIG && !period.allocation_config) {
    await patchPeriodConfig(period.id, config)
  }

  const headcount_by_geo = headcountByGeo(employees)
  return { ok: true, result: { period_id: period.id, pools, headcount_by_geo } }
}

// ─── Core computation (pure function, tested directly) ───────────────────────

export function computePools(
  period: BudgetPeriodRecord,
  employees: Employee[],
  config: AllocationConfig
): BudgetPoolRecord[] {
  const total = period.total_allocation_usd
  const tier3 = round2(total * (config.tier3_pct / 100))
  const reserve = round2(total * (config.reserve_pct / 100))
  const geoRemainder = round2(total - tier3 - reserve)

  const pools: BudgetPoolRecord[] = []
  const periodId = period.id

  // ── Off-the-top pools ────────────────────────────────────────────────────
  pools.push(
    makePool({
      period_id: periodId,
      pool_type: 'committee_tier3',
      geo: null,
      owner_id: null,
      department: null,
      allocated: tier3,
    })
  )
  pools.push(
    makePool({
      period_id: periodId,
      pool_type: 'reserve',
      geo: null,
      owner_id: null,
      department: null,
      allocated: reserve,
    })
  )

  // ── Geo split by active headcount ─────────────────────────────────────────
  const hc = headcountByGeo(employees)
  const totalHc = GEOS.reduce((sum, g) => sum + hc[g], 0)
  if (totalHc === 0) return pools

  for (const geo of GEOS) {
    const geoHc = hc[geo]
    if (geoHc === 0) continue
    const geoAllocation = round2(geoRemainder * (geoHc / totalHc))

    const within = config.within_geo
    const mgrTotal = round2(geoAllocation * (within.manager_tier1_pct / 100))
    const peerTotal = round2(geoAllocation * (within.peer_tier1_pct / 100))
    const deptTotal = round2(geoAllocation * (within.dept_tier2_pct / 100))

    pools.push(
      makePool({
        period_id: periodId,
        pool_type: 'peer_tier1',
        geo,
        owner_id: null,
        department: null,
        allocated: peerTotal,
      })
    )

    // Manager Tier 1 pools — proportional to direct-reports count within geo.
    // NOTE: revisit after Q1 with real usage data (spec §10.1 "3x typical").
    const managersInGeo = managersInGeoWithReportCounts(employees, geo)
    const totalReports = managersInGeo.reduce(
      (sum, m) => sum + m.direct_reports,
      0
    )
    if (managersInGeo.length > 0 && mgrTotal > 0) {
      if (totalReports === 0) {
        // Edge case: flag managers but no reports show up as direct_reports
        // yet (new hire before org tree updates). Equal split.
        const per = round2(mgrTotal / managersInGeo.length)
        for (const m of managersInGeo) {
          pools.push(
            makePool({
              period_id: periodId,
              pool_type: 'manager_tier1',
              geo,
              owner_id: m.id,
              department: null,
              allocated: per,
            })
          )
        }
      } else {
        for (const m of managersInGeo) {
          const share = round2(mgrTotal * (m.direct_reports / totalReports))
          pools.push(
            makePool({
              period_id: periodId,
              pool_type: 'manager_tier1',
              geo,
              owner_id: m.id,
              department: null,
              allocated: share,
            })
          )
        }
      }
    }

    // Department Tier 2 pools — proportional to department headcount in geo.
    // NOTE: revisit after Q1 with real usage data.
    const deptCounts = deptHeadcountsInGeo(employees, geo)
    const totalDeptHc = Object.values(deptCounts).reduce((s, n) => s + n, 0)
    if (totalDeptHc > 0 && deptTotal > 0) {
      for (const [department, count] of Object.entries(deptCounts)) {
        const share = round2(deptTotal * (count / totalDeptHc))
        pools.push(
          makePool({
            period_id: periodId,
            pool_type: 'department_tier2',
            geo,
            owner_id: null,
            department,
            allocated: share,
          })
        )
      }
    }
  }

  return pools
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function headcountByGeo(employees: Employee[]): Record<Geo, number> {
  const out: Record<Geo, number> = { US: 0, India: 0, Colombia: 0 }
  for (const e of employees) {
    if (!e.active) continue
    out[e.geo] += 1
  }
  return out
}

interface ManagerTally {
  id: string
  direct_reports: number
}

function managersInGeoWithReportCounts(
  employees: Employee[],
  geo: Geo
): ManagerTally[] {
  // A manager = active employee with at least one active direct report.
  // Only count managers in this geo; report counts span all geos (spec
  // doesn't restrict by geo, and cross-geo reports are common at Novo).
  const reportsByManager = new Map<string, number>()
  for (const e of employees) {
    if (!e.active) continue
    if (!e.manager_id) continue
    reportsByManager.set(
      e.manager_id,
      (reportsByManager.get(e.manager_id) ?? 0) + 1
    )
  }
  return employees
    .filter((e) => e.active && e.geo === geo && reportsByManager.has(e.id))
    .map((e) => ({ id: e.id, direct_reports: reportsByManager.get(e.id) ?? 0 }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function deptHeadcountsInGeo(
  employees: Employee[],
  geo: Geo
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of employees) {
    if (!e.active) continue
    if (e.geo !== geo) continue
    if (!e.department) continue
    out[e.department] = (out[e.department] ?? 0) + 1
  }
  return out
}

function makePool(args: {
  period_id: string
  pool_type: PoolType
  geo: Geo | null
  owner_id: string | null
  department: string | null
  allocated: number
}): BudgetPoolRecord {
  return {
    id: `pool_${randomUUID()}`,
    period_id: args.period_id,
    pool_type: args.pool_type,
    geo: args.geo,
    owner_id: args.owner_id,
    department: args.department,
    allocated_amount_usd: args.allocated,
    spent_amount_usd: 0,
    reserved_amount_usd: 0,
    remaining_amount_usd: args.allocated,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function validateConfig(c: AllocationConfig) {
  const topLevelSum = c.tier3_pct + c.reserve_pct
  if (c.tier3_pct < 0 || c.reserve_pct < 0 || topLevelSum > 100) {
    return {
      code: 'invalid_config' as const,
      reason: 'tier3_pct + reserve_pct must be ≥ 0 and ≤ 100',
    }
  }
  const w = c.within_geo
  const wSum = w.manager_tier1_pct + w.peer_tier1_pct + w.dept_tier2_pct
  if (
    w.manager_tier1_pct < 0 ||
    w.peer_tier1_pct < 0 ||
    w.dept_tier2_pct < 0 ||
    Math.abs(wSum - 100) > 0.01
  ) {
    return {
      code: 'invalid_config' as const,
      reason: 'within_geo percentages must be ≥ 0 and sum to 100',
    }
  }
  return null
}

async function loadPeriod(id: string): Promise<BudgetPeriodRecord | null> {
  if (useMock()) return findMockPeriodById(id)
  const row = await db.budgetPeriod.findUnique({ where: { id } })
  if (!row) return null
  return hydratePeriodRow(row)
}

async function loadActiveEmployees(): Promise<Employee[]> {
  if (useMock()) return MOCK_EMPLOYEES.filter((e) => e.active)
  const rows = await db.employee.findMany({ where: { active: true } })
  return rows as unknown as Employee[]
}

async function patchPeriodConfig(id: string, config: AllocationConfig): Promise<void> {
  if (useMock()) {
    const { updateMockPeriod } = await import('./mock-store')
    updateMockPeriod(id, { allocation_config: config })
    return
  }
  await db.budgetPeriod.update({
    where: { id },
    data: { allocation_config: config as unknown as object },
  })
}

// Shape-converts a Prisma row into our TS record type.
function hydratePeriodRow(row: unknown): BudgetPeriodRecord {
  const r = row as {
    id: string
    period_label: string
    start_date: Date
    end_date: Date
    total_allocation_usd: { toNumber(): number } | number
    status: BudgetPeriodStatusValue
    approved_by: string[]
    approved_at: Date | null
    allocation_config: unknown
    closed_at: Date | null
  }
  return {
    id: r.id,
    period_label: r.period_label,
    start_date: r.start_date,
    end_date: r.end_date,
    total_allocation_usd: decimalToNumber(r.total_allocation_usd),
    status: r.status as BudgetPeriodRecord['status'],
    approved_by: r.approved_by,
    approved_at: r.approved_at,
    allocation_config: (r.allocation_config as AllocationConfig | null) ?? null,
    closed_at: r.closed_at,
  }
}

type BudgetPeriodStatusValue = BudgetPeriodRecord['status']

function decimalToNumber(v: { toNumber(): number } | number | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return v.toNumber()
}

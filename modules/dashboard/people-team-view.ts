import { getDisplayablePeriod } from '@/modules/budget/periods'
import { listPoolsForPeriod } from '@/modules/budget/pools'
import { computePacing } from '@/modules/budget/pacing'
import { listExceptionsForPeriod } from '@/modules/budget/exceptions'
import { listSlaMissesForPeriod } from '@/modules/approvals/queries'
import type { SlaMissRecord } from '@/modules/approvals/queries'
import { getEmployeesByIds } from '@/modules/employees/service'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { getValueById } from '@/modules/values/constants'
import type {
  BudgetExceptionRecord,
  BudgetPeriodRecord,
  BudgetPoolRecord,
  PacingIndicator,
} from '@/modules/budget/types'
import type { Employee, Geo } from '@/modules/employees/types'
import type { ValueDef } from '@/modules/values/constants'

// Spec §3 + §10.5 — People team sees the full program dashboard. We show
// it as three stacked sections:
//   (a) pools grouped by geo + the reserve + the Tier 3 committee pool,
//   (b) budget exceptions taken from reserve this period,
//   (c) SLA misses — escalations + auto-denies — this period.
//
// Tier labels are kept out of the component copy per spec §2 principle 1;
// internal plumbing variable names (department_tier2, etc.) stay on the
// service side. Dollar amounts are fine on this surface because the
// viewer *is* the amount owner (spec §2 principle 2 — approvers/owners
// see their own scope; People team's scope is program-wide).

export const GEOS: Geo[] = ['US', 'India', 'Colombia']

export interface PoolWithPacing {
  pool: BudgetPoolRecord
  pacing: PacingIndicator
  owner_name: string | null
}

export interface GeoPoolGroup {
  geo: Geo
  // Aggregated totals so the page can show geo-level pacing at a glance.
  allocated_usd: number
  spent_usd: number
  remaining_usd: number
  pacing: PacingIndicator
  // Individual pools for the drill-down. Manager_tier1 pools carry an
  // owner_name so the table doesn't show opaque ids.
  manager_tier1: PoolWithPacing[]
  peer_tier1: PoolWithPacing | null
  department_tier2: PoolWithPacing[]
}

export interface ExceptionRow {
  exception: BudgetExceptionRecord
  approver: Employee | null
  nominee: Employee | null
}

export interface SlaMissRow {
  miss: SlaMissRecord
  nominator: Employee | null
  nominee: Employee | null
  value: ValueDef | null
}

export interface PeopleTeamDashboardView {
  // Null when the viewer is not a People-team rep — UI hides the page.
  authorized: boolean
  period: BudgetPeriodRecord | null
  in_grace: boolean
  grace_ends_at: Date | null
  pools_by_geo: GeoPoolGroup[]
  reserve: PoolWithPacing | null
  tier3_pool: PoolWithPacing | null
  exceptions: ExceptionRow[]
  sla_misses: SlaMissRow[]
}

const EMPTY_VIEW: PeopleTeamDashboardView = {
  authorized: false,
  period: null,
  in_grace: false,
  grace_ends_at: null,
  pools_by_geo: [],
  reserve: null,
  tier3_pool: null,
  exceptions: [],
  sla_misses: [],
}

export async function getPeopleTeamDashboardView(
  employeeId: string,
  now: Date = new Date()
): Promise<PeopleTeamDashboardView> {
  const authorized = await isPeopleTeamRep(employeeId)
  if (!authorized) return EMPTY_VIEW

  const displayable = await getDisplayablePeriod(now)
  const period = displayable?.period ?? null
  if (!period) {
    return { ...EMPTY_VIEW, authorized: true }
  }

  const [pools, exceptions, misses] = await Promise.all([
    listPoolsForPeriod(period.id),
    listExceptionsForPeriod(period.id),
    listSlaMissesForPeriod(period.start_date, period.end_date),
  ])

  // Resolve all employee ids referenced across pools + exceptions + misses
  // in a single batch to keep the dashboard O(1) DB round-trips.
  const employeeIds = new Set<string>()
  for (const p of pools) {
    if (p.owner_id) employeeIds.add(p.owner_id)
  }
  for (const e of exceptions) {
    employeeIds.add(e.approver_id)
  }
  for (const m of misses) {
    employeeIds.add(m.nomination.nominator_id)
    employeeIds.add(m.nomination.nominee_id)
  }
  // Exception nominee lookup requires the Nomination row; surface the
  // nominee via the same batch when we can.
  const exceptionNomineeIds = await resolveExceptionNomineeIds(
    exceptions.map((e) => e.nomination_id)
  )
  for (const id of exceptionNomineeIds.values()) employeeIds.add(id)

  const employees = employeeIds.size
    ? await getEmployeesByIds([...employeeIds])
    : new Map<string, Employee>()

  const pools_by_geo = GEOS.map((geo) => buildGeoGroup(geo, pools, employees, period, now))
  const reserve = findPoolWithPacing(
    pools.find((p) => p.pool_type === 'reserve') ?? null,
    employees,
    period,
    now
  )
  const tier3_pool = findPoolWithPacing(
    pools.find((p) => p.pool_type === 'committee_tier3') ?? null,
    employees,
    period,
    now
  )

  const exceptionRows: ExceptionRow[] = exceptions.map((ex) => ({
    exception: ex,
    approver: employees.get(ex.approver_id) ?? null,
    nominee:
      employees.get(exceptionNomineeIds.get(ex.nomination_id) ?? '') ?? null,
  }))

  const slaRows: SlaMissRow[] = misses.map((m) => ({
    miss: m,
    nominator: employees.get(m.nomination.nominator_id) ?? null,
    nominee: employees.get(m.nomination.nominee_id) ?? null,
    value: getValueById(m.nomination.value_id),
  }))

  return {
    authorized: true,
    period,
    in_grace: displayable?.in_grace ?? false,
    grace_ends_at: displayable?.grace_ends_at ?? null,
    pools_by_geo,
    reserve,
    tier3_pool,
    exceptions: exceptionRows,
    sla_misses: slaRows,
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function findPoolWithPacing(
  pool: BudgetPoolRecord | null,
  employees: Map<string, Employee>,
  period: BudgetPeriodRecord,
  now: Date
): PoolWithPacing | null {
  if (!pool) return null
  return {
    pool,
    pacing: computePacing({ pool, period, now }),
    owner_name: pool.owner_id ? employees.get(pool.owner_id)?.name ?? null : null,
  }
}

function buildGeoGroup(
  geo: Geo,
  pools: BudgetPoolRecord[],
  employees: Map<string, Employee>,
  period: BudgetPeriodRecord,
  now: Date
): GeoPoolGroup {
  const inGeo = pools.filter((p) => p.geo === geo)
  const manager_tier1 = inGeo
    .filter((p) => p.pool_type === 'manager_tier1')
    .map((p) => findPoolWithPacing(p, employees, period, now)!)
    // Alphabetical by manager name so the People team view is scannable.
    .sort((a, b) => (a.owner_name ?? '').localeCompare(b.owner_name ?? ''))

  const peer_tier1 = findPoolWithPacing(
    inGeo.find((p) => p.pool_type === 'peer_tier1') ?? null,
    employees,
    period,
    now
  )

  const department_tier2 = inGeo
    .filter((p) => p.pool_type === 'department_tier2')
    .map((p) => findPoolWithPacing(p, employees, period, now)!)
    .sort((a, b) => (a.pool.department ?? '').localeCompare(b.pool.department ?? ''))

  const allocated_usd =
    sum(manager_tier1.map((x) => x.pool.allocated_amount_usd)) +
    (peer_tier1?.pool.allocated_amount_usd ?? 0) +
    sum(department_tier2.map((x) => x.pool.allocated_amount_usd))
  const spent_usd =
    sum(manager_tier1.map((x) => x.pool.spent_amount_usd)) +
    (peer_tier1?.pool.spent_amount_usd ?? 0) +
    sum(department_tier2.map((x) => x.pool.spent_amount_usd))
  const remaining_usd =
    sum(manager_tier1.map((x) => x.pool.remaining_amount_usd)) +
    (peer_tier1?.pool.remaining_amount_usd ?? 0) +
    sum(department_tier2.map((x) => x.pool.remaining_amount_usd))

  // Aggregated pacing: treat the geo as a single synthetic pool using the
  // summed allocation/spend. Keeps the geo-level chip honest even when
  // individual pool pacings disagree.
  const synthetic: BudgetPoolRecord = {
    id: `synthetic_${geo}`,
    period_id: period.id,
    pool_type: 'peer_tier1',
    geo,
    owner_id: null,
    department: null,
    allocated_amount_usd: allocated_usd,
    spent_amount_usd: spent_usd,
    reserved_amount_usd: 0,
    remaining_amount_usd: remaining_usd,
  }
  const pacing = computePacing({ pool: synthetic, period, now })

  return {
    geo,
    allocated_usd,
    spent_usd,
    remaining_usd,
    pacing,
    manager_tier1,
    peer_tier1,
    department_tier2,
  }
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

// Batched nominee lookup for exceptions — exceptions carry a nomination_id
// but not the nominee, so we resolve it here. A single pass over mock data
// or one Prisma findMany depending on mode.
async function resolveExceptionNomineeIds(
  nominationIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = Array.from(new Set(nominationIds.filter((id) => id.length > 0)))
  if (unique.length === 0) return out

  if (process.env.USE_MOCK_DATA === 'true') {
    const { listAllMock } = await import('@/modules/nominations/mock-store')
    const byId = new Map(listAllMock().map((n) => [n.id, n]))
    for (const id of unique) {
      const nom = byId.get(id)
      if (nom) out.set(id, nom.nominee_id)
    }
    return out
  }

  const { db } = await import('@/lib/db')
  const rows = await db.nomination.findMany({
    where: { id: { in: unique } },
    select: { id: true, nominee_id: true },
  })
  for (const row of rows) out.set(row.id, row.nominee_id)
  return out
}

/** @jest-environment node */
import { db } from '@/lib/db'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  closePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { commitSpend } from '@/modules/budget/pools'
import { drawFromReserve } from '@/modules/budget/exceptions'
import { resolvePoolForNomination } from '@/modules/budget/routing'
import { DEFAULT_ALLOCATION_CONFIG } from '@/modules/budget/types'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

describeIntegration('Budget engine E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('full lifecycle: create → allocate → approve → activate → route → commit', async () => {
    const created = await createPeriod({
      period_label: 'Q2 2026 (integration)',
      start_date: new Date(Date.now() - 1_000),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      total_allocation_usd: 100_000,
      allocation_config: DEFAULT_ALLOCATION_CONFIG,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const alloc = await allocatePools(created.period.id, DEFAULT_ALLOCATION_CONFIG)
    expect(alloc.ok).toBe(true)
    if (!alloc.ok) return

    // Pools persisted in Postgres.
    const poolCount = await db.budgetPool.count({
      where: { period_id: created.period.id },
    })
    expect(poolCount).toBe(alloc.result.pools.length)

    // Committee sign-off (both members required).
    await approvePeriod(created.period.id, 'emp_001')
    const afterFirst = await db.budgetPeriod.findUniqueOrThrow({
      where: { id: created.period.id },
    })
    expect(afterFirst.status).toBe('draft')

    await approvePeriod(created.period.id, 'emp_002')
    const afterBoth = await db.budgetPeriod.findUniqueOrThrow({
      where: { id: created.period.id },
    })
    expect(afterBoth.status).toBe('approved')
    expect(afterBoth.approved_at).toBeInstanceOf(Date)

    await activatePeriod(created.period.id)

    // Route a Tier 1 peer nomination and commit a spend.
    const resolved = await resolvePoolForNomination({
      nomination_id: 'nom_integ_1',
      current_tier: 1,
      nominator_id: 'emp_007',
      nominee_id: 'emp_006',
      nominee_manager_id: 'emp_005',
      nominee_geo: 'US',
      nominee_department: 'Engineering',
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.pool.pool_type).toBe('peer_tier1')
    expect(resolved.pool.geo).toBe('US')

    const spend = await commitSpend({
      pool_id: resolved.pool.id,
      amount_usd: 150,
    })
    expect(spend.ok).toBe(true)
    if (!spend.ok) return
    expect(spend.pool.spent_amount_usd).toBe(150)

    // Verify Postgres row reflects the spend.
    const poolRow = await db.budgetPool.findUniqueOrThrow({
      where: { id: resolved.pool.id },
    })
    expect(Number(poolRow.spent_amount_usd)).toBe(150)
    expect(Number(poolRow.remaining_amount_usd)).toBe(
      Number(poolRow.allocated_amount_usd) - 150
    )
  })

  it('optimistic locking: over-commit returns insufficient_balance without mutating spend', async () => {
    const created = await createPeriod({
      period_label: 'Q2 2026 (overflow)',
      start_date: new Date(Date.now() - 1_000),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      total_allocation_usd: 1_000,
    })
    if (!created.ok) return
    await allocatePools(created.period.id)

    const reservePool = await db.budgetPool.findFirstOrThrow({
      where: { period_id: created.period.id, pool_type: 'reserve' },
    })
    const allocated = Number(reservePool.allocated_amount_usd)

    // Try to spend more than the reserve holds.
    const tooMuch = await commitSpend({
      pool_id: reservePool.id,
      amount_usd: allocated + 1,
    })
    expect(tooMuch.ok).toBe(false)
    if (tooMuch.ok) return
    expect(tooMuch.error.code).toBe('insufficient_balance')

    // Verify no mutation occurred.
    const after = await db.budgetPool.findUniqueOrThrow({
      where: { id: reservePool.id },
    })
    expect(Number(after.spent_amount_usd)).toBe(0)
    expect(Number(after.remaining_amount_usd)).toBe(allocated)
  })

  it('drawFromReserve writes a BudgetException row', async () => {
    const created = await createPeriod({
      period_label: 'Q2 2026 (exception)',
      start_date: new Date(Date.now() - 1_000),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      total_allocation_usd: 100_000,
    })
    if (!created.ok) return
    await allocatePools(created.period.id)

    // We need a Nomination row for the FK. Seed a minimal one.
    const nomination = await db.nomination.create({
      data: {
        nominator_id: 'emp_007',
        nominee_id: 'emp_006',
        value_id: 'val_run_for_the_bus',
        behavior_text:
          'An exception-path scenario where the peer pool was exhausted.',
        outcome_text:
          'Committee approved via reserve; exception logged for review.',
        status: 'approved',
      },
    })

    const r = await drawFromReserve({
      period_id: created.period.id,
      nomination_id: nomination.id,
      amount_usd: 500,
      approver_id: 'emp_005',
      reason_text: 'Peer pool exhausted mid-quarter.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const stored = await db.budgetException.findMany({
      where: { nomination_id: nomination.id },
    })
    expect(stored).toHaveLength(1)
    expect(Number(stored[0].amount_usd)).toBe(500)
  })

  it('closePeriod stamps closed_at and leaves pools intact for the grace window', async () => {
    const created = await createPeriod({
      period_label: 'Q2 2026 (close)',
      start_date: new Date(Date.now() - 1_000),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      total_allocation_usd: 100_000,
    })
    if (!created.ok) return
    await allocatePools(created.period.id)
    await approvePeriod(created.period.id, 'emp_001')
    await approvePeriod(created.period.id, 'emp_002')
    await activatePeriod(created.period.id)

    const closed = await closePeriod(created.period.id, 'emp_001')
    expect(closed.ok).toBe(true)
    if (!closed.ok) return
    expect(closed.period.status).toBe('closed')
    expect(closed.period.closed_at).toBeInstanceOf(Date)

    // Pools still exist — grace window for in-flight approvals.
    const poolCount = await db.budgetPool.count({
      where: { period_id: created.period.id },
    })
    expect(poolCount).toBeGreaterThan(0)
  })
})

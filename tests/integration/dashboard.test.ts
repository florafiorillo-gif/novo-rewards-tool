/** @jest-environment node */
import { db } from '@/lib/db'
import { getManagerDashboardView } from '@/modules/dashboard/manager-view'
import { getDepartmentDashboardView } from '@/modules/dashboard/department-view'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  closePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { createNomination } from '@/modules/nominations/service'
import {
  approveNomination,
  proposeUpgrade,
} from '@/modules/approvals/service'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text:
    'Shipped the migration on a tight deadline after the reviewer was out.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedActivePeriod() {
  const created = await createPeriod({
    period_label: 'Q2 2026 (integration)',
    start_date: new Date(Date.now() - 1_000),
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    total_allocation_usd: 100_000,
  })
  if (!created.ok) throw new Error('seed: createPeriod')
  const alloc = await allocatePools(created.period.id)
  if (!alloc.ok) throw new Error('seed: allocatePools')
  await approvePeriod(created.period.id, 'emp_001')
  await approvePeriod(created.period.id, 'emp_002')
  await activatePeriod(created.period.id)
  return created.period.id
}

describeIntegration('Manager dashboard view E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('assembles pool + pacing + Tier 1 pending + recent from Postgres', async () => {
    await seedActivePeriod()

    // Pending Tier 1: Jamie (emp_007) nominates Alex (emp_006) → Sarah (emp_005).
    const pending = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    expect(pending.ok).toBe(true)

    // Approved Tier 1: Alex (emp_006) nominates Jamie (emp_007), Sarah approves.
    const approved = await createNomination(
      {
        ...baseInput,
        nominee_id: 'emp_007',
        behavior_text:
          'Kept the cross-team release moving while we were short-handed.',
        outcome_text: 'Launch held its date and nobody had to drop their plan.',
      },
      'emp_006'
    )
    if (!approved.ok) throw new Error('approved seed failed')
    const approve = await approveNomination({
      nomination_id: approved.nomination.id,
      actor_id: 'emp_005',
    })
    expect(approve.ok).toBe(true)

    const view = await getManagerDashboardView('emp_005')
    expect(view.period?.period_label).toBe('Q2 2026 (integration)')
    expect(view.pool).not.toBeNull()
    expect(view.pool!.pool_type).toBe('manager_tier1')
    expect(view.pool!.owner_id).toBe('emp_005')
    expect(view.pacing).not.toBeNull()
    expect(view.pending_tier1_count).toBe(1)
    expect(view.recent).toHaveLength(1)
    expect(view.recent[0].nomination.id).toBe(approved.nomination.id)
    expect(view.recent[0].nominee?.id).toBe('emp_007')
  })

  // Regression for review finding #1: before the relation-filter fix, the
  // Prisma path fetched the top N approve actions and filtered tier 1 in
  // memory. A viewer who had many unrelated approve actions (as a Tier 2
  // approver or committee member) could starve the buffer.
  it('still returns Tier 1 recent items when the viewer also has Tier 2 approvals (fix #1)', async () => {
    await seedActivePeriod()

    // Tier 1 approval Sarah did.
    const t1 = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!t1.ok) throw new Error('t1 seed failed')
    await approveNomination({
      nomination_id: t1.nomination.id,
      actor_id: 'emp_005',
    })

    // Tier 2 upgrade where Sarah ends up as dept head approver. Propose
    // from a different nomination and have Sarah approve at Tier 2 — that
    // writes an approve action that would have dominated the old buffer.
    const forUpgrade = await createNomination(
      {
        ...baseInput,
        nominee_id: 'emp_007',
        behavior_text:
          'Shepherded the cross-org initiative without dropping the team plan.',
        outcome_text: 'Org-wide follow-through landed without regression.',
      },
      'emp_006'
    )
    if (!forUpgrade.ok) throw new Error('upgrade seed failed')
    const up = await proposeUpgrade({
      nomination_id: forUpgrade.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'Cross-org outcome warrants more weight than a Tier 1 peer shoutout.',
    })
    expect(up.ok).toBe(true)
    // Sarah approves at Tier 2 (she is the Engineering/US dept head).
    const t2 = await approveNomination({
      nomination_id: forUpgrade.nomination.id,
      actor_id: 'emp_005',
    })
    expect(t2.ok).toBe(true)

    // The dashboard must still surface the Tier 1 approval despite the
    // unrelated Tier 2 approve row now being more recent in the log.
    const view = await getManagerDashboardView('emp_005')
    expect(view.recent.map((r) => r.nomination.id)).toEqual([t1.nomination.id])
    expect(view.pending_tier1_count).toBe(0)
  })

  it('surfaces the pool during the 14-day close-grace window', async () => {
    const periodId = await seedActivePeriod()
    // Close with a closed_at 5 days in the past so we're still in grace.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    await closePeriod(periodId, 'emp_001', fiveDaysAgo)

    // Direct Prisma assertion for the closed_at persistence.
    const row = await db.budgetPeriod.findUniqueOrThrow({ where: { id: periodId } })
    expect(row.status).toBe('closed')

    const view = await getManagerDashboardView('emp_005')
    expect(view.period?.id).toBe(periodId)
    expect(view.in_grace).toBe(true)
    expect(view.pool).not.toBeNull()
  })
})

describeIntegration('Department head dashboard view E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('assembles dept pool + managers list + pending T2 from Postgres', async () => {
    await seedActivePeriod()

    // Propose a Tier 2 upgrade where Sarah is the snapshot dept head.
    const nom = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!nom.ok) throw new Error('nom seed failed')
    const up = await proposeUpgrade({
      nomination_id: nom.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'Cross-org outcome warrants more weight than a Tier 1 peer shoutout.',
    })
    expect(up.ok).toBe(true)

    const view = await getDepartmentDashboardView('emp_005')
    expect(view.department).toBe('Engineering')
    expect(view.geo).toBe('US')
    expect(view.dept_pool).not.toBeNull()
    expect(view.dept_pool!.pool_type).toBe('department_tier2')
    expect(view.dept_pool!.department).toBe('Engineering')
    expect(view.dept_pool!.geo).toBe('US')
    expect(view.dept_pacing).not.toBeNull()
    expect(view.pending_tier2_count).toBe(1)

    // Managers list: Sarah herself manages emp_006/emp_007, so she appears.
    // No other US-Engineering managers in the seed.
    const ids = view.manager_pools.map((m) => m.manager.id)
    expect(ids).toContain('emp_005')
    expect(view.manager_pools.every((m) => m.pool.pool_type === 'manager_tier1')).toBe(
      true
    )
  })

  it('returns empty shape for a non-dept-head viewer', async () => {
    await seedActivePeriod()
    const view = await getDepartmentDashboardView('emp_006')
    expect(view.department).toBeNull()
    expect(view.dept_pool).toBeNull()
    expect(view.manager_pools).toEqual([])
    expect(view.pending_tier2_count).toBe(0)
  })
})

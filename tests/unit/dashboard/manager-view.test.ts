/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  getManagerDashboardView,
  pacingCopy,
} from '@/modules/dashboard/manager-view'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import {
  listMockPoolsForPeriod,
  resetMockBudget,
  updateMockPool,
} from '@/modules/budget/mock-store'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import {
  approveNomination,
  resetMockApprovalActions,
} from '@/modules/approvals/service'

// Reusable seed: Q2 2026 active period with pools allocated from the mock
// org. Committee are emp_001 (Rares) and emp_002 (Flora); the managers in
// the US geo include emp_005 (Sarah, VP Engineering) with direct reports
// emp_006 (Alex) and emp_007 (Jamie).
const PERIOD_START = new Date('2026-04-01')
const PERIOD_END = new Date('2026-06-30')
const MIDPOINT = new Date('2026-05-15')

async function seedActivePeriod() {
  const created = await createPeriod({
    period_label: 'Q2 2026',
    start_date: PERIOD_START,
    end_date: PERIOD_END,
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

const validNomination = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

beforeEach(() => {
  resetMockBudget()
  resetMockNominations()
  resetMockApprovalActions()
})

describe('getManagerDashboardView', () => {
  it('returns pool + pacing + recent for a manager with an allocated pool', async () => {
    const periodId = await seedActivePeriod()
    const pool = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'manager_tier1' && p.owner_id === 'emp_005'
    )!
    // Spend ~50% to land in on_track at the 50% mark.
    const half = Math.round(pool.allocated_amount_usd * 0.5 * 100) / 100
    updateMockPool(pool.id, {
      spent_amount_usd: half,
      remaining_amount_usd: pool.allocated_amount_usd - half,
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.period?.id).toBe(periodId)
    expect(view.pool).not.toBeNull()
    expect(view.pool!.pool_type).toBe('manager_tier1')
    expect(view.pool!.owner_id).toBe('emp_005')
    expect(view.pacing).toBe('on_track')
    expect(view.pending_count).toBe(0)
    expect(view.recent).toEqual([])
  })

  it('flags under_utilized for a manager who has not spent by mid-period', async () => {
    await seedActivePeriod()
    // Fresh allocation, zero spend at 50% elapsed → drift = -50% < -20%.
    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pacing).toBe('under_utilized')
  })

  it('returns null pool for an individual contributor', async () => {
    await seedActivePeriod()
    // emp_006 (Alex) is a direct report, not a manager — no manager_tier1 pool.
    const view = await getManagerDashboardView('emp_006', MIDPOINT)
    expect(view.pool).toBeNull()
    expect(view.pacing).toBeNull()
    expect(view.period).not.toBeNull() // period still visible
  })

  it('returns null period and null pool when nothing is active', async () => {
    // No seed — nothing allocated.
    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.period).toBeNull()
    expect(view.pool).toBeNull()
    expect(view.pacing).toBeNull()
  })

  it('flips pacing to running_hot when spent outpaces elapsed', async () => {
    const periodId = await seedActivePeriod()
    const pool = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'manager_tier1' && p.owner_id === 'emp_005'
    )!
    // Force spend to 80% with only 50% elapsed → well above +15% threshold.
    const eighty = Math.round(pool.allocated_amount_usd * 0.8 * 100) / 100
    updateMockPool(pool.id, {
      spent_amount_usd: eighty,
      remaining_amount_usd: pool.allocated_amount_usd - eighty,
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pacing).toBe('running_hot')
  })

  it('counts pending approvals for this viewer', async () => {
    await seedActivePeriod()
    // emp_007 (Jamie) nominates emp_006 (Alex); both report to emp_005 (Sarah),
    // so Sarah is the Tier 1 approver (peer-manager routing).
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('nom seed failed')

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pending_count).toBe(1)
  })

  it('includes recent recognitions the viewer approved, newest first', async () => {
    await seedActivePeriod()

    // Two nominations, both approved by emp_005.
    const n1 = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!n1.ok) throw new Error('n1 seed failed')
    await approveNomination({
      nomination_id: n1.nomination.id,
      actor_id: 'emp_005',
    })
    // Mock actions use Date.now() — stagger so the sort order is deterministic.
    await new Promise((r) => setTimeout(r, 5))

    const n2 = await createNomination(
      {
        ...validNomination,
        nominee_id: 'emp_007',
        behavior_text:
          'Worked across three time zones to keep the release unblocked.',
        outcome_text:
          'Ship date held and nobody else had to drop their roadmap work.',
      },
      'emp_006'
    )
    if (!n2.ok) throw new Error('n2 seed failed')
    await approveNomination({
      nomination_id: n2.nomination.id,
      actor_id: 'emp_005',
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toHaveLength(2)
    // Newest first — n2 was approved after n1.
    expect(view.recent[0].nomination.id).toBe(n2.nomination.id)
    expect(view.recent[1].nomination.id).toBe(n1.nomination.id)
    expect(view.recent[0].nominee?.id).toBe('emp_007')
    expect(view.recent[0].value?.id).toBe('val_run_for_the_bus')
  })

  it('does not include recognitions approved by a different actor', async () => {
    await seedActivePeriod()

    // emp_008 (Priya, India engineering manager) approves a peer nomination
    // routed to her — shouldn't appear in emp_005's dashboard.
    const created = await createNomination(
      {
        ...validNomination,
        nominee_id: 'emp_009',
      },
      'emp_008'
    )
    if (!created.ok) throw new Error('seed failed')
    // Self-approval requires a reflection.
    await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_008',
      reflection_type: 'SPECIFIC_MOMENT',
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toEqual([])
  })
})

describe('pacingCopy', () => {
  it('maps each indicator to a tone + warm-tone label', () => {
    expect(pacingCopy('on_track').tone).toBe('green')
    expect(pacingCopy('running_hot').tone).toBe('amber')
    expect(pacingCopy('under_utilized').tone).toBe('gray')
  })
})

/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { getManagerDashboardView } from '@/modules/dashboard/manager-view'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  closePeriod,
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
  denyNomination,
  proposeUpgrade,
  undoApproval,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

// Reusable seed: Q2 2026 active period with pools allocated from the mock
// org. Committee are emp_001 (Rares) and emp_002 (Flora); the managers in
// the US geo include emp_005 (Sarah, VP Engineering) with direct reports
// emp_006 (Alex) and emp_007 (Jamie).
const PERIOD_START = new Date('2026-04-01')
const PERIOD_END = new Date('2026-06-30')
const MIDPOINT = new Date('2026-05-15')
const AFTER_END = new Date('2026-07-05') // 5 days after close
const AFTER_GRACE = new Date('2026-08-01') // > 14 days after close

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
  // In-mock-data counter lives on the module object; reset between tests so
  // a prior test's dept-head toggle doesn't bleed into the next one.
  for (const e of MOCK_EMPLOYEES) {
    e.tier2_assignments_count = 0
  }
})

describe('getManagerDashboardView — basic shape', () => {
  it('returns pool + pacing for a manager with an allocated pool', async () => {
    const periodId = await seedActivePeriod()
    const pool = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'manager_tier1' && p.owner_id === 'emp_005'
    )!
    const half = Math.round(pool.allocated_amount_usd * 0.5 * 100) / 100
    updateMockPool(pool.id, {
      spent_amount_usd: half,
      remaining_amount_usd: pool.allocated_amount_usd - half,
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.period?.id).toBe(periodId)
    expect(view.in_grace).toBe(false)
    expect(view.grace_ends_at).toBeNull()
    expect(view.pool).not.toBeNull()
    expect(view.pool!.pool_type).toBe('manager_tier1')
    expect(view.pool!.owner_id).toBe('emp_005')
    expect(view.pacing).toBe('on_track')
    expect(view.pending_tier1_count).toBe(0)
    expect(view.recent).toEqual([])
  })

  it('flags under_utilized for a manager who has not spent by mid-period', async () => {
    await seedActivePeriod()
    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pacing).toBe('under_utilized')
  })

  it('flips pacing to running_hot when spent outpaces elapsed', async () => {
    const periodId = await seedActivePeriod()
    const pool = listMockPoolsForPeriod(periodId).find(
      (p) => p.pool_type === 'manager_tier1' && p.owner_id === 'emp_005'
    )!
    const eighty = Math.round(pool.allocated_amount_usd * 0.8 * 100) / 100
    updateMockPool(pool.id, {
      spent_amount_usd: eighty,
      remaining_amount_usd: pool.allocated_amount_usd - eighty,
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pacing).toBe('running_hot')
  })

  it('returns null pool for an individual contributor', async () => {
    await seedActivePeriod()
    const view = await getManagerDashboardView('emp_006', MIDPOINT)
    expect(view.pool).toBeNull()
    expect(view.pacing).toBeNull()
    expect(view.period).not.toBeNull()
  })

  it('returns null period and null pool when nothing is active', async () => {
    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.period).toBeNull()
    expect(view.pool).toBeNull()
    expect(view.pacing).toBeNull()
    expect(view.in_grace).toBe(false)
  })
})

describe('getManagerDashboardView — close-grace window (fix #2)', () => {
  it('still surfaces the pool during the 14-day close-grace window', async () => {
    const periodId = await seedActivePeriod()
    // Committee member closes the period 5 days before our clock.
    await closePeriod(periodId, 'emp_001', new Date('2026-06-30'))

    const view = await getManagerDashboardView('emp_005', AFTER_END)
    expect(view.period?.id).toBe(periodId)
    expect(view.in_grace).toBe(true)
    expect(view.grace_ends_at).toBeInstanceOf(Date)
    expect(view.pool).not.toBeNull()
    expect(view.pacing).not.toBeNull()
  })

  it('drops the period once the 14-day grace has expired', async () => {
    const periodId = await seedActivePeriod()
    await closePeriod(periodId, 'emp_001', new Date('2026-06-30'))

    const view = await getManagerDashboardView('emp_005', AFTER_GRACE)
    expect(view.period).toBeNull()
    expect(view.pool).toBeNull()
    expect(view.in_grace).toBe(false)
  })
})

describe('getManagerDashboardView — pending_tier1_count (fix #3)', () => {
  it('counts Tier 1 pending approvals for the viewer', async () => {
    await seedActivePeriod()
    // emp_007 (Jamie) nominates emp_006 (Alex); both report to emp_005 (Sarah),
    // so Sarah is the Tier 1 approver (peer-manager routing).
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('nom seed failed')

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pending_tier1_count).toBe(1)
  })

  it('does NOT include Tier 2 items for a manager who is also a dept head', async () => {
    await seedActivePeriod()

    // Create a Tier 1 peer nomination → Sarah (emp_005) is approver. Then
    // upgrade it to Tier 2. After upgrade, current_tier=2 and Sarah is the
    // snapshot dept_head for Engineering/US.
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('nom seed failed')
    const up = await proposeUpgrade({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'This is a cross-team impact that warrants Tier 2 recognition — needs more weight.',
    })
    expect(up.ok).toBe(true)

    // Sarah is now a Tier 2 approver (dept head for US Engineering). If we
    // conflated tiers this would surface as pending_tier1_count=1.
    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.pending_tier1_count).toBe(0)
  })
})

describe('getManagerDashboardView — recent list semantics', () => {
  it('includes recent recognitions the viewer approved, newest first', async () => {
    await seedActivePeriod()

    const n1 = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!n1.ok) throw new Error('n1 seed failed')
    await approveNomination({
      nomination_id: n1.nomination.id,
      actor_id: 'emp_005',
    })
    await new Promise((r) => setTimeout(r, 10))

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
    expect(view.recent[0].nomination.id).toBe(n2.nomination.id)
    expect(view.recent[1].nomination.id).toBe(n1.nomination.id)
    expect(view.recent[0].nominee?.id).toBe('emp_007')
    expect(view.recent[0].value?.id).toBe('val_run_for_the_bus')
  })

  it('excludes recognitions approved by a different actor', async () => {
    await seedActivePeriod()
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_009' },
      'emp_008'
    )
    if (!created.ok) throw new Error('seed failed')
    // emp_009 reports to emp_008 in the mock org, so this is a self-approval
    // (nominator = approver) which requires a reflection_type.
    await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_008',
      reflection_type: 'SPECIFIC_MOMENT',
    })

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toEqual([])
  })

  it('excludes denied nominations (#11)', async () => {
    await seedActivePeriod()
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    const denied = await denyNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      reason_structured: 'insufficient_detail',
      reason_text: 'Could you add a specific moment?',
    })
    expect(denied.ok).toBe(true)

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toEqual([])
  })

  it('excludes undone approvals (#10, spec §13.3)', async () => {
    await seedActivePeriod()
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    const approved = await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
    })
    expect(approved.ok).toBe(true)
    const undone = await undoApproval({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
    })
    expect(undone.ok).toBe(true)

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toEqual([])
  })

  it('excludes a nomination that was upgraded by the manager (#9)', async () => {
    await seedActivePeriod()
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    // Manager proposes upgrade instead of approving — no approve action
    // from emp_005, and current_tier is now 2.
    const up = await proposeUpgrade({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'This is a cross-team impact that warrants Tier 2 recognition — needs more weight.',
    })
    expect(up.ok).toBe(true)

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toEqual([])
  })

  it('caps the recent list at RECENT_LIMIT (5) (#23)', async () => {
    await seedActivePeriod()
    // Seed 7 nominations, all approved by emp_005. Interleave with small
    // waits so the sort order is deterministic.
    for (let i = 0; i < 7; i++) {
      const created = await createNomination(
        {
          ...validNomination,
          nominee_id: i % 2 === 0 ? 'emp_006' : 'emp_007',
          behavior_text: `Iteration ${i} — did the work across time zones with care.`,
          outcome_text: `Iteration ${i} — kept the release unblocked for the team.`,
        },
        i % 2 === 0 ? 'emp_007' : 'emp_006'
      )
      if (!created.ok) throw new Error(`seed ${i} failed`)
      await approveNomination({
        nomination_id: created.nomination.id,
        actor_id: 'emp_005',
      })
      await new Promise((r) => setTimeout(r, 5))
    }

    const view = await getManagerDashboardView('emp_005', MIDPOINT)
    expect(view.recent).toHaveLength(5)
  })
})

/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { getDepartmentDashboardView } from '@/modules/dashboard/department-view'
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
  proposeUpgrade,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

// Dept-head context under test: emp_005 (Sarah) is the US Engineering dept
// head. Her department includes emp_006 (Alex, IC) and emp_007 (Jamie, IC)
// — neither is a manager. To get a second manager in the same (dept, geo)
// we flip emp_007's flag locally; restored by the beforeEach reset.

const PERIOD_START = new Date('2026-04-01')
const PERIOD_END = new Date('2026-06-30')
const MIDPOINT = new Date('2026-05-15')
const AFTER_END = new Date('2026-07-05')
const AFTER_GRACE = new Date('2026-08-01')

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

// Snapshot the original flags so mutation in individual tests doesn't leak.
const originalFlags = new Map(
  MOCK_EMPLOYEES.map((e) => [
    e.id,
    {
      is_department_head: e.is_department_head,
      tier2_assignments_count: e.tier2_assignments_count,
    },
  ])
)

beforeEach(() => {
  resetMockBudget()
  resetMockNominations()
  resetMockApprovalActions()
  for (const e of MOCK_EMPLOYEES) {
    const snap = originalFlags.get(e.id)
    if (snap) {
      e.is_department_head = snap.is_department_head
      e.tier2_assignments_count = snap.tier2_assignments_count
    }
  }
})

describe('getDepartmentDashboardView — basic shape', () => {
  it('returns empty view for a non-dept-head viewer', async () => {
    await seedActivePeriod()
    // emp_006 (Alex) is an IC in Engineering/US, not a dept head.
    const view = await getDepartmentDashboardView('emp_006', MIDPOINT)
    expect(view.department).toBeNull()
    expect(view.geo).toBeNull()
    expect(view.dept_pool).toBeNull()
    expect(view.manager_pools).toEqual([])
    expect(view.pending_tier2_count).toBe(0)
  })

  it('returns dept + geo but null period when nothing is active', async () => {
    // Sarah is still flagged as dept head; no period seeded.
    const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
    expect(view.department).toBe('Engineering')
    expect(view.geo).toBe('US')
    expect(view.period).toBeNull()
    expect(view.dept_pool).toBeNull()
  })

  it('returns the dept Tier 2 pool scoped to (department, geo)', async () => {
    const periodId = await seedActivePeriod()
    const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
    expect(view.period?.id).toBe(periodId)
    expect(view.dept_pool).not.toBeNull()
    expect(view.dept_pool!.pool_type).toBe('department_tier2')
    expect(view.dept_pool!.department).toBe('Engineering')
    expect(view.dept_pool!.geo).toBe('US')
    expect(view.dept_pacing).not.toBeNull()
  })

  it('computes dept pacing from spend', async () => {
    const periodId = await seedActivePeriod()
    const pool = listMockPoolsForPeriod(periodId).find(
      (p) =>
        p.pool_type === 'department_tier2' &&
        p.department === 'Engineering' &&
        p.geo === 'US'
    )!
    const eighty = Math.round(pool.allocated_amount_usd * 0.8 * 100) / 100
    updateMockPool(pool.id, {
      spent_amount_usd: eighty,
      remaining_amount_usd: pool.allocated_amount_usd - eighty,
    })
    const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
    expect(view.dept_pacing).toBe('running_hot')
  })
})

describe('getDepartmentDashboardView — managers list', () => {
  it('includes managers in the same (department, geo) with a tier1 pool', async () => {
    await seedActivePeriod()
    // Sarah is both dept head and a manager (has reports emp_006, emp_007).
    const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
    const ids = view.manager_pools.map((m) => m.manager.id)
    expect(ids).toContain('emp_005')
    expect(view.manager_pools.every((m) => m.pool.pool_type === 'manager_tier1')).toBe(
      true
    )
    expect(view.manager_pools.every((m) => m.pacing !== null)).toBe(true)
  })

  it('excludes managers outside the viewer dept or geo', async () => {
    await seedActivePeriod()
    const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
    // emp_008 (Priya) is Engineering/India dept head — different geo.
    // emp_004 (Sakshi) is People/US dept head — different department.
    const ids = view.manager_pools.map((m) => m.manager.id)
    expect(ids).not.toContain('emp_008')
    expect(ids).not.toContain('emp_004')
  })

  it('sorts managers alphabetically by name', async () => {
    // Add a second Engineering/US manager by flipping an IC's flag + giving
    // them a synthetic report via manager_id reassignment. Easiest: promote
    // emp_007 (Jamie) to manager of emp_006 (Alex) inside Engineering/US.
    // Keep the mutation scoped to this test — beforeEach will restore.
    const alex = MOCK_EMPLOYEES.find((e) => e.id === 'emp_006')!
    const originalManagerId = alex.manager_id
    alex.manager_id = 'emp_007'
    try {
      await seedActivePeriod()
      const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
      const names = view.manager_pools.map((m) => m.manager.name)
      const sorted = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).toEqual(sorted)
      expect(names).toContain('Jamie Kim')
      expect(names).toContain('Sarah Chen')
    } finally {
      alex.manager_id = originalManagerId
    }
  })
})

describe('getDepartmentDashboardView — pending_tier2_count', () => {
  it('counts Tier 2 items where viewer is the snapshot dept head', async () => {
    await seedActivePeriod()
    // emp_007 → emp_006 nomination, Sarah proposes upgrade → Sarah is
    // snapshot dept head for Engineering/US.
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    const up = await proposeUpgrade({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'This is a cross-team impact that warrants Tier 2 recognition — needs more weight.',
    })
    expect(up.ok).toBe(true)

    const view = await getDepartmentDashboardView('emp_005', MIDPOINT)
    expect(view.pending_tier2_count).toBe(1)
  })

  it('ignores Tier 2 items where viewer is only the People-team rep', async () => {
    await seedActivePeriod()
    // Sakshi (emp_004) is People/US dept head and a People-team rep. A
    // Tier 2 nomination in Engineering/US routes to Sarah as dept head and
    // assigns the People-team rep via rotation — Sakshi. Her dashboard as
    // the *People dept head* should not count this (she's not the snapshot
    // dept head on that nomination).
    const created = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    const up = await proposeUpgrade({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'This is a cross-team impact that warrants Tier 2 recognition — needs more weight.',
    })
    expect(up.ok).toBe(true)

    const sakshiView = await getDepartmentDashboardView('emp_004', MIDPOINT)
    expect(sakshiView.pending_tier2_count).toBe(0)
  })
})

describe('getDepartmentDashboardView — close-grace window', () => {
  it('still surfaces the dept pool during the 14-day grace', async () => {
    const periodId = await seedActivePeriod()
    await closePeriod(periodId, 'emp_001', new Date('2026-06-30'))
    const view = await getDepartmentDashboardView('emp_005', AFTER_END)
    expect(view.period?.id).toBe(periodId)
    expect(view.in_grace).toBe(true)
    expect(view.grace_ends_at).toBeInstanceOf(Date)
    expect(view.dept_pool).not.toBeNull()
  })

  it('drops the dept pool once the 14-day grace has expired', async () => {
    const periodId = await seedActivePeriod()
    await closePeriod(periodId, 'emp_001', new Date('2026-06-30'))
    const view = await getDepartmentDashboardView('emp_005', AFTER_GRACE)
    expect(view.period).toBeNull()
    expect(view.dept_pool).toBeNull()
    expect(view.manager_pools).toEqual([])
  })
})

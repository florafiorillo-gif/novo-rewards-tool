/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { getPeopleTeamDashboardView } from '@/modules/dashboard/people-team-view'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { drawFromReserve } from '@/modules/budget/exceptions'
import { resetMockBudget } from '@/modules/budget/mock-store'
import { createNomination } from '@/modules/nominations/service'
import {
  resetMockNominations,
  updateMock as updateNominationMock,
} from '@/modules/nominations/mock-store'
import { resetMockApprovalActions } from '@/modules/approvals/service'
import { runSlaSweep } from '@/modules/approvals/sla'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

const PERIOD_START = new Date('2026-04-01')
const PERIOD_END = new Date('2026-06-30')
const MIDPOINT = new Date('2026-05-15')

async function seedActivePeriod() {
  const r = await createPeriod({
    period_label: 'Q2 2026',
    start_date: PERIOD_START,
    end_date: PERIOD_END,
    total_allocation_usd: 100_000,
  })
  if (!r.ok) throw new Error('seed')
  await allocatePools(r.period.id)
  await approvePeriod(r.period.id, 'emp_001')
  await approvePeriod(r.period.id, 'emp_002')
  await activatePeriod(r.period.id)
  return r.period.id
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
  for (const e of MOCK_EMPLOYEES) {
    e.tier2_assignments_count = 0
  }
})

describe('getPeopleTeamDashboardView — authorization', () => {
  it('returns unauthorized shape for a non-rep viewer', async () => {
    await seedActivePeriod()
    // emp_005 (Sarah) is dept head but not a People-team rep.
    const view = await getPeopleTeamDashboardView('emp_005', MIDPOINT)
    expect(view.authorized).toBe(false)
    expect(view.period).toBeNull()
    expect(view.pools_by_geo).toEqual([])
  })

  it('returns authorized view for a People-team rep', async () => {
    await seedActivePeriod()
    // emp_004 (Sakshi) is the People Ops rep.
    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    expect(view.authorized).toBe(true)
    expect(view.period?.period_label).toBe('Q2 2026')
  })
})

describe('getPeopleTeamDashboardView — pools by geo', () => {
  it('groups pools into US / India / Colombia with aggregated pacing', async () => {
    await seedActivePeriod()
    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    const geos = view.pools_by_geo.map((g) => g.geo)
    expect(geos).toEqual(['US', 'India', 'Colombia'])
    for (const g of view.pools_by_geo) {
      expect(g.allocated_usd).toBeGreaterThan(0)
      expect(g.pacing).toBeDefined()
      expect(g.manager_tier1.length + (g.peer_tier1 ? 1 : 0) + g.department_tier2.length).toBeGreaterThan(0)
    }
  })

  it('populates reserve + committee_tier3 program pools', async () => {
    await seedActivePeriod()
    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    expect(view.reserve).not.toBeNull()
    expect(view.reserve!.pool.pool_type).toBe('reserve')
    expect(view.tier3_pool).not.toBeNull()
    expect(view.tier3_pool!.pool.pool_type).toBe('committee_tier3')
  })

  it('hydrates manager pool owner names for the drill-down', async () => {
    await seedActivePeriod()
    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    const us = view.pools_by_geo.find((g) => g.geo === 'US')!
    expect(us.manager_tier1.length).toBeGreaterThan(0)
    for (const mp of us.manager_tier1) {
      expect(mp.owner_name).not.toBeNull()
    }
  })
})

describe('getPeopleTeamDashboardView — exceptions', () => {
  it('lists reserve draws in the current period', async () => {
    const periodId = await seedActivePeriod()
    // Create a throw-away nomination to pin the nominee for the exception row.
    const nom = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!nom.ok) throw new Error('seed failed')

    const draw = await drawFromReserve({
      period_id: periodId,
      nomination_id: nom.nomination.id,
      amount_usd: 150,
      approver_id: 'emp_005',
      reason_text: 'Primary pool exhausted this week.',
    })
    expect(draw.ok).toBe(true)

    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    expect(view.exceptions).toHaveLength(1)
    const row = view.exceptions[0]
    expect(row.exception.amount_usd).toBe(150)
    expect(row.approver?.id).toBe('emp_005')
    expect(row.nominee?.id).toBe('emp_006')
  })
})

describe('getPeopleTeamDashboardView — SLA misses', () => {
  it('surfaces auto-denied nominations with system actor', async () => {
    await seedActivePeriod()

    // Create a nomination and age it past the auto-deny threshold (21 days).
    const nom = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!nom.ok) throw new Error('seed failed')
    // Rewind submitted_at so the sweep treats it as 25 days old.
    const submittedAt = new Date(MIDPOINT.getTime() - 25 * 24 * 60 * 60 * 1000)
    updateNominationMock(nom.nomination.id, { submitted_at: submittedAt })

    await runSlaSweep(MIDPOINT)

    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    expect(view.sla_misses.length).toBeGreaterThanOrEqual(1)
    const hit = view.sla_misses.find((m) => m.miss.nomination.id === nom.nomination.id)
    expect(hit).toBeDefined()
    expect(hit!.miss.kind).toBe('auto_denied')
    expect(hit!.nominator?.id).toBe('emp_007')
    expect(hit!.nominee?.id).toBe('emp_006')
  })

  it('surfaces escalations (7-day) without auto-denying', async () => {
    await seedActivePeriod()
    const nom = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!nom.ok) throw new Error('seed failed')
    const submittedAt = new Date(MIDPOINT.getTime() - 10 * 24 * 60 * 60 * 1000)
    updateNominationMock(nom.nomination.id, { submitted_at: submittedAt })

    await runSlaSweep(MIDPOINT)

    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    const hit = view.sla_misses.find((m) => m.miss.nomination.id === nom.nomination.id)
    expect(hit).toBeDefined()
    expect(hit!.miss.kind).toBe('escalated')
  })

  it('excludes SLA events outside the current period', async () => {
    await seedActivePeriod()
    const nom = await createNomination(
      { ...validNomination, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!nom.ok) throw new Error('seed failed')
    // Submit prior to the period and let the sweep age it out there.
    const priorSubmittedAt = new Date(PERIOD_START.getTime() - 40 * 24 * 60 * 60 * 1000)
    updateNominationMock(nom.nomination.id, { submitted_at: priorSubmittedAt })
    // Run the sweep at a clock within the prior period so the escalate +
    // auto-deny event_at timestamps fall outside Q2's window.
    const priorNow = new Date(PERIOD_START.getTime() - 5 * 24 * 60 * 60 * 1000)
    await runSlaSweep(priorNow)

    const view = await getPeopleTeamDashboardView('emp_004', MIDPOINT)
    expect(view.sla_misses).toEqual([])
  })
})

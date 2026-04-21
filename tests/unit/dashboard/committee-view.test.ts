/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { getCommitteeDashboardView } from '@/modules/dashboard/committee-view'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { resetMockBudget } from '@/modules/budget/mock-store'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import {
  proposeUpgrade,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import {
  decideCommittee,
  recuseCommitteeMember,
} from '@/modules/committee/service'
import { resetMockCommitteeDecisions } from '@/modules/committee/mock-store'
import { resetMockRewards } from '@/modules/rewards/mock-store'
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

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

const SAMPLE_REWARD = {
  reward_type: 'experience' as const,
  amount_usd: 2500,
  delivery_plan: 'Rares delivers in person at next all-hands.',
  scope_note_text: 'Exceptional impact — Value Share recognition.',
}

async function seedAndApproveTier3(nomineeId = 'emp_006') {
  const r = await createNomination(
    { ...baseInput, nominee_id: nomineeId },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed nom')
  const up = await proposeUpgrade({
    nomination_id: r.nomination.id,
    actor_id: 'emp_005',
    to_tier: 3,
    reasoning: 'Exceptional impact — committee-level recognition warranted.',
  })
  if (!up.ok) throw new Error('upgrade')
  // Second committee member recuses so `emp_001` alone can decide.
  await recuseCommitteeMember({
    nomination_id: r.nomination.id,
    actor_id: 'emp_002',
  })
  const decided = await decideCommittee({
    nomination_id: r.nomination.id,
    actor_id: 'emp_001',
    decision: 'approve',
    decision_log_text: 'Clear Value Share moment.',
    reward: SAMPLE_REWARD,
  })
  if (!decided.ok) throw new Error('decide')
  return { nominationId: r.nomination.id, decisionId: decided.decision.id }
}

beforeEach(() => {
  resetMockBudget()
  resetMockNominations()
  resetMockApprovalActions()
  resetMockCommitteeDecisions()
  resetMockRewards()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
})

describe('getCommitteeDashboardView — authorization', () => {
  it('returns empty shell for a non-committee viewer', async () => {
    await seedActivePeriod()
    const view = await getCommitteeDashboardView('emp_005', MIDPOINT)
    expect(view.is_committee).toBe(false)
    expect(view.authorized).toBe(false)
    expect(view.decisions).toEqual([])
    expect(view.period).toBeNull()
  })

  it('grants program visibility to a committee member who is NOT a People-team rep', async () => {
    await seedActivePeriod()
    // emp_001 (Rares) is is_committee_member=true but not a People-team rep.
    const view = await getCommitteeDashboardView('emp_001', MIDPOINT)
    expect(view.is_committee).toBe(true)
    expect(view.authorized).toBe(true)
    expect(view.period?.period_label).toBe('Q2 2026')
    expect(view.tier3_pool).not.toBeNull()
    expect(view.pools_by_geo.length).toBeGreaterThan(0)
  })
})

describe('getCommitteeDashboardView — decisions log', () => {
  it('includes decisions from the current period, hydrated with nominee', async () => {
    await seedActivePeriod()
    const { nominationId } = await seedAndApproveTier3()

    const view = await getCommitteeDashboardView('emp_001', MIDPOINT)
    expect(view.decisions).toHaveLength(1)
    const row = view.decisions[0]
    expect(row.decision.decision).toBe('approve')
    expect(row.nomination?.id).toBe(nominationId)
    expect(row.nominee?.id).toBe('emp_006')
  })

  it('returns empty decisions when none have been logged yet', async () => {
    await seedActivePeriod()
    const view = await getCommitteeDashboardView('emp_001', MIDPOINT)
    expect(view.decisions).toEqual([])
  })

  it('returns the tier3_pool with spend after a committee approve', async () => {
    await seedActivePeriod()
    await seedAndApproveTier3()
    const view = await getCommitteeDashboardView('emp_001', MIDPOINT)
    expect(view.tier3_pool).not.toBeNull()
    expect(view.tier3_pool!.pool.spent_amount_usd).toBe(2500)
  })
})

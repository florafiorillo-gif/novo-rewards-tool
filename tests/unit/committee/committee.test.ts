/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  proposeUpgrade,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import {
  decideCommittee,
  recuseCommitteeMember,
} from '@/modules/committee/service'
import { resetMockCommitteeDecisions } from '@/modules/committee/mock-store'
import { resetMockRewards } from '@/modules/rewards/mock-store'
import { resetMockBudget } from '@/modules/budget/mock-store'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

async function seedActivePeriod() {
  const created = await createPeriod({
    period_label: 'Q2 2026 (committee test)',
    start_date: new Date(Date.now() - 1_000),
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    total_allocation_usd: 100_000,
  })
  if (!created.ok) throw new Error('seed period')
  await allocatePools(created.period.id)
  await approvePeriod(created.period.id, 'emp_001')
  await approvePeriod(created.period.id, 'emp_002')
  await activatePeriod(created.period.id)
}

const SAMPLE_REWARD = {
  reward_type: 'experience' as const,
  amount_usd: 2500,
  delivery_plan: 'Rares delivers in person at next all-hands.',
  scope_note_text: 'Exceptional impact — Value Share recognition.',
}

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedTier3(nomineeId = 'emp_006') {
  const r = await createNomination(
    { ...baseInput, nominee_id: nomineeId },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed')
  const up = await proposeUpgrade({
    nomination_id: r.nomination.id,
    actor_id: 'emp_005',
    to_tier: 3,
    reasoning: 'Exceptional impact — committee-level recognition warranted.',
  })
  if (!up.ok) throw new Error('upgrade')
  return up.nomination
}

beforeEach(async () => {
  resetMockNominations()
  resetMockApprovalActions()
  resetMockCommitteeDecisions()
  resetMockRewards()
  resetMockBudget()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
  await seedActivePeriod()
})

describe('decideCommittee (spec §7.5)', () => {
  it('approves a Tier 3 nomination with a decision log + reward', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001', // Rares, committee member
      decision: 'approve',
      decision_log_text: 'Clear Value Share moment. Approved with Rares + Flora concurring.',
      reward: SAMPLE_REWARD,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('approved')
    expect(r.decision.approved_amount_usd).toBe(SAMPLE_REWARD.amount_usd)
    expect(r.decision.reward_form).toBe(SAMPLE_REWARD.reward_type)
  })

  it('rejects approve without a reward payload', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      decision: 'approve',
      decision_log_text: 'Forgot the reward.',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('reward_required_on_approve')
  })

  it('rejects approve with an out-of-range amount', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      decision: 'approve',
      decision_log_text: 'Too big.',
      reward: { ...SAMPLE_REWARD, amount_usd: 6000 },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('reward_amount_out_of_range')
  })

  it('rejects decisions from non-committee members', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      decision: 'approve',
      decision_log_text: 'Not my call.',
      reward: SAMPLE_REWARD,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('forbidden')
  })

  it('requires a decision log', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      decision: 'defer',
      decision_log_text: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('decision_log_required')
  })

  it('deny drops back to Tier 2 under_review', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      decision: 'deny',
      decision_log_text: 'Impact is real but Tier 2 is the right scope here.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('returned_to_tier_2')
  })

  it('defer leaves the nomination in the queue for next meeting', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      decision: 'defer',
      decision_log_text: 'Want more context from the team before deciding.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('deferred')
  })

  it('blocks decisions from a recused committee member', async () => {
    const nom = await seedTier3()
    const rec = await recuseCommitteeMember({
      nomination_id: nom.id,
      actor_id: 'emp_001',
    })
    expect(rec.ok).toBe(true)
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      decision: 'approve',
      decision_log_text: 'I should not be deciding here.',
      reward: SAMPLE_REWARD,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('recused')
  })
})

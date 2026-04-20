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
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

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

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
  resetMockCommitteeDecisions()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
})

describe('decideCommittee (spec §7.5)', () => {
  it('approves a Tier 3 nomination with a decision log', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_001', // Rares, committee member
      decision: 'approve',
      decision_log_text: 'Clear Value Share moment. Approved with Rares + Flora concurring.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('approved')
  })

  it('rejects decisions from non-committee members', async () => {
    const nom = await seedTier3()
    const r = await decideCommittee({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      decision: 'approve',
      decision_log_text: 'Not my call.',
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
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('recused')
  })
})

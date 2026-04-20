/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  proposeUpgrade,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
})

async function seed() {
  const r = await createNomination(
    { ...baseInput, nominee_id: 'emp_006' },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed')
  return r.nomination
}

describe('proposeUpgrade', () => {
  it('rejects when reasoning is blank', async () => {
    const nom = await seed()
    const r = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning: '  ',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('reasoning_required')
  })

  it('rejects downgrade attempts', async () => {
    const nom = await seed()
    const r = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      to_tier: 1 as unknown as 2,
      reasoning: 'Nope.',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('invalid_tier_transition')
  })

  it('rejects upgrade by a non-approver at Tier 1', async () => {
    const nom = await seed()
    const r = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: 'emp_003',
      to_tier: 2,
      reasoning: 'Legitimate reasoning text goes here.',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('forbidden')
  })

  it('Tier 1 → Tier 3 direct escalation (manager can skip Tier 2)', async () => {
    const nom = await seed()
    const r = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      to_tier: 3,
      reasoning: 'Exceptional Value Share impact — committee should review.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.nomination.current_tier).toBe(3)
    expect(r.action.action).toBe('propose_upgrade')
  })
})

/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  approveNomination,
  denyNomination,
  proposeUpgrade,
  resetMockApprovalActions,
} from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedPeer() {
  const r = await createNomination(
    { ...baseInput, nominee_id: 'emp_006' },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed')
  return r.nomination
}

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
})

describe('denyNomination', () => {
  it('Tier 1 deny sets status=denied with denied_at', async () => {
    const nom = await seedPeer()
    const r = await denyNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      reason_structured: 'value_mismatch',
      reason_text: 'This looked more like routine work than the value cited.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('denied')
    expect(r.nomination.status).toBe('denied')
    expect(r.nomination.denied_at).toBeInstanceOf(Date)
  })

  it('rejects deny without reason_text', async () => {
    const nom = await seedPeer()
    const r = await denyNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      reason_structured: 'other',
      reason_text: '   ',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('reason_text_required')
  })

  it('Tier 2 deny returns the nomination to Tier 1 with the manager back as approver', async () => {
    const nom = await seedPeer()
    // Manager proposes upgrade to Tier 2.
    const up = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning: 'This is clearly larger than a Tier 1 spot recognition.',
    })
    if (!up.ok) throw new Error('upgrade failed')
    const deptHeadId = up.nomination.tier2_dept_head_id!
    expect(deptHeadId).toBeTruthy()

    const r = await denyNomination({
      nomination_id: nom.id,
      actor_id: deptHeadId,
      reason_structured: 'insufficient_detail',
      reason_text: 'Not enough concrete impact to justify Tier 2.',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('returned_to_tier_1')
    expect(r.nomination.current_tier).toBe(1)
    expect(r.nomination.status).toBe('submitted')
    expect(r.nomination.current_approver_id).toBe('emp_005')
    expect(r.nomination.tier2_dept_head_id).toBeNull()
    expect(r.nomination.tier2_people_team_rep_id).toBeNull()
  })
})

describe('denyNomination authorization', () => {
  it('forbids Tier 1 deny by someone other than the current approver', async () => {
    const nom = await seedPeer()
    const r = await denyNomination({
      nomination_id: nom.id,
      actor_id: 'emp_006',
      reason_structured: 'other',
      reason_text: 'no',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('forbidden')
  })
})

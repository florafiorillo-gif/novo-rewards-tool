/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  approveNomination,
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
  // Mock data mutates tier2_assignments_count — restore for deterministic rotation.
  for (const e of MOCK_EMPLOYEES) e.tier2_assignments_count = 0
})

async function seedAndUpgradeToTier2() {
  const r = await createNomination(
    { ...baseInput, nominee_id: 'emp_006' },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed')
  const up = await proposeUpgrade({
    nomination_id: r.nomination.id,
    actor_id: 'emp_005',
    to_tier: 2,
    reasoning: 'This is clearly larger than a Tier 1 spot recognition.',
  })
  if (!up.ok) throw new Error('upgrade')
  return up.nomination
}

describe('Tier 2 two-approver flow (spec §7.4)', () => {
  it('snapshots both the dept head and a People team rep at propose-upgrade', async () => {
    const nom = await seedAndUpgradeToTier2()
    // Alex is in Engineering; Sarah Chen (emp_005) is US Engineering dept head.
    expect(nom.tier2_dept_head_id).toBe('emp_005')
    // First rep by round-robin tie-break is emp_002 (Flora) — excluded because
    // she wasn't the actor, so Flora wins on id tiebreak against Sakshi.
    expect(nom.tier2_people_team_rep_id).toBeTruthy()
    expect(['emp_002', 'emp_004']).toContain(nom.tier2_people_team_rep_id!)
  })

  it('stays under_review after the first of two Tier 2 approvals', async () => {
    const nom = await seedAndUpgradeToTier2()
    const first = await approveNomination({
      nomination_id: nom.id,
      actor_id: nom.tier2_dept_head_id!,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.became_final).toBe(false)
    expect(first.nomination.status).toBe('under_review')
  })

  it('flips to approved only after both snapshot approvers have approved', async () => {
    const nom = await seedAndUpgradeToTier2()
    await approveNomination({
      nomination_id: nom.id,
      actor_id: nom.tier2_dept_head_id!,
    })
    const second = await approveNomination({
      nomination_id: nom.id,
      actor_id: nom.tier2_people_team_rep_id!,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.became_final).toBe(true)
    expect(second.nomination.status).toBe('approved')
  })

  it('forbids approval by someone outside the snapshot pair', async () => {
    const nom = await seedAndUpgradeToTier2()
    const r = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_001', // CEO, not in the snapshot pair
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('forbidden')
  })

  it('rotates the People team rep assignment (round-robin counter)', async () => {
    const firstUpgrade = await seedAndUpgradeToTier2()
    resetMockNominations()
    resetMockApprovalActions()
    const second = await seedAndUpgradeToTier2()
    expect(firstUpgrade.tier2_people_team_rep_id).not.toBe(
      second.tier2_people_team_rep_id
    )
  })

  // Audit I3 — defense in depth against double-click / programmatic repeat
  // approvals from the same actor. A second call from the same approver
  // must return forbidden rather than writing a duplicate audit row.
  it('refuses a second approve from the same Tier 2 actor', async () => {
    const nom = await seedAndUpgradeToTier2()
    const first = await approveNomination({
      nomination_id: nom.id,
      actor_id: nom.tier2_dept_head_id!,
    })
    expect(first.ok).toBe(true)

    const duplicate = await approveNomination({
      nomination_id: nom.id,
      actor_id: nom.tier2_dept_head_id!,
    })
    expect(duplicate.ok).toBe(false)
    if (duplicate.ok) return
    expect(duplicate.error.code).toBe('forbidden')

    // And the audit trail should only carry one approve row from this actor.
    const { listApprovalActions } = await import('@/modules/approvals/service')
    const actions = await listApprovalActions(nom.id)
    const approvesFromDeptHead = actions.filter(
      (a) =>
        a.action === 'approve' && a.actor_id === nom.tier2_dept_head_id!
    )
    expect(approvesFromDeptHead).toHaveLength(1)
  })

  // Audit I9 — first Tier 2 approver must receive a non-stale nomination
  // record. We can't easily observe updated_at differing yet (the first
  // approve doesn't currently patch the nomination), but we can assert
  // the returned object is the live record — i.e., the in-store value
  // after writeAction, not the pre-call copy.
  it('returns a fresh nomination record on first Tier 2 approve', async () => {
    const { findByIdMock } = await import('@/modules/nominations/mock-store')
    const nom = await seedAndUpgradeToTier2()
    const result = await approveNomination({
      nomination_id: nom.id,
      actor_id: nom.tier2_dept_head_id!,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const live = findByIdMock(nom.id)
    // The returned record and the store's view should agree field-for-field.
    expect(result.nomination.id).toBe(live?.id)
    expect(result.nomination.status).toBe(live?.status)
    expect(result.nomination.updated_at.getTime()).toBe(
      live!.updated_at.getTime()
    )
  })
})

describe('Tier 2 → Tier 3 escalate', () => {
  it('moves the nomination into the committee queue with urgent flag honored', async () => {
    const nom = await seedAndUpgradeToTier2()
    const esc = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: nom.tier2_dept_head_id!,
      to_tier: 3,
      reasoning: 'Wider impact than Tier 2 — this merits committee review.',
      urgent: true,
    })
    expect(esc.ok).toBe(true)
    if (!esc.ok) return
    expect(esc.nomination.current_tier).toBe(3)
    expect(esc.nomination.status).toBe('under_review')
    expect(esc.nomination.urgent).toBe(true)
  })

  it('refuses to escalate from an outsider', async () => {
    const nom = await seedAndUpgradeToTier2()
    const esc = await proposeUpgrade({
      nomination_id: nom.id,
      actor_id: 'emp_001',
      to_tier: 3,
      reasoning: 'Not my place but I will try.',
    })
    expect(esc.ok).toBe(false)
    if (esc.ok) return
    expect(esc.error.code).toBe('forbidden')
  })
})

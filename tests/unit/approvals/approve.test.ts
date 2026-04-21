/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { approveNomination, undoApproval, resetMockApprovalActions, UNDO_WINDOW_MS } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedPeerNomination(
  nominatorId = 'emp_007',
  nomineeId = 'emp_006'
) {
  const result = await createNomination(
    { ...baseInput, nominee_id: nomineeId },
    nominatorId
  )
  if (!result.ok) throw new Error('seed failed')
  return result.nomination
}

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
})

describe('approveNomination (Tier 1 peer path)', () => {
  it('approves a Tier 1 nomination by the current approver', async () => {
    const nom = await seedPeerNomination() // approver = emp_005
    const result = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nomination.status).toBe('approved')
    expect(result.became_final).toBe(true)
    expect(result.nomination.approved_at).toBeInstanceOf(Date)
  })

  it('refuses approval from someone other than the current approver', async () => {
    const nom = await seedPeerNomination()
    const result = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_006', // the nominee
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('forbidden')
  })

  it('refuses approval on an already-approved nomination', async () => {
    const nom = await seedPeerNomination()
    await approveNomination({ nomination_id: nom.id, actor_id: 'emp_005' })
    const second = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
    })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('wrong_status')
  })

  it('requires a reflection_type when the actor is also the nominator (self-approval)', async () => {
    // Manager nominates own report: nominator = emp_005, nominee = emp_006.
    const selfResult = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_005'
    )
    if (!selfResult.ok) throw new Error('seed failed')

    const missing = await approveNomination({
      nomination_id: selfResult.nomination.id,
      actor_id: 'emp_005',
    })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.error.code).toBe('reflection_required')

    const ok = await approveNomination({
      nomination_id: selfResult.nomination.id,
      actor_id: 'emp_005',
      reflection_type: 'SPECIFIC_MOMENT',
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.action.reflection_type).toBe('SPECIFIC_MOMENT')
  })

  it('rejects reflection_type on a peer-path approval', async () => {
    const nom = await seedPeerNomination()
    const result = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      reflection_type: 'OTHER',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('reflection_not_allowed')
  })
})

describe('undoApproval (10-minute window, spec §13.3)', () => {
  it('undoes a Tier 1 approval inside the window', async () => {
    const nom = await seedPeerNomination()
    const approved = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
    })
    if (!approved.ok) throw new Error('approve failed')

    const undone = await undoApproval({
      nomination_id: nom.id,
      actor_id: 'emp_005',
    })
    expect(undone.ok).toBe(true)
    if (!undone.ok) return
    expect(undone.nomination.status).toBe('submitted')
    expect(undone.nomination.approved_at).toBeNull()
    expect(undone.nomination.current_approver_id).toBe('emp_005')
  })

  it('refuses undo after the window expires', async () => {
    const nom = await seedPeerNomination()
    const approved = await approveNomination({
      nomination_id: nom.id,
      actor_id: 'emp_005',
    })
    if (!approved.ok) throw new Error('approve failed')
    const later = new Date(Date.now() + UNDO_WINDOW_MS + 1000)
    const undone = await undoApproval({
      nomination_id: nom.id,
      actor_id: 'emp_005',
      now: later,
    })
    expect(undone.ok).toBe(false)
    if (undone.ok) return
    expect(undone.error.code).toBe('window_expired')
  })

  it('refuses undo by someone other than the approver', async () => {
    const nom = await seedPeerNomination()
    await approveNomination({ nomination_id: nom.id, actor_id: 'emp_005' })
    const undone = await undoApproval({
      nomination_id: nom.id,
      actor_id: 'emp_001',
    })
    expect(undone.ok).toBe(false)
    if (undone.ok) return
    expect(undone.error.code).toBe('forbidden')
  })

  // Audit I4 / spec §13.3 — undo is Tier 1 only. No UI reaches this
  // today, but the service has to reject Tier 2/3 in case a programmatic
  // caller finds it.
  it('refuses undo on a Tier 2 approved nomination', async () => {
    const { updateMock } = await import('@/modules/nominations/mock-store')
    const nom = await seedPeerNomination()
    await approveNomination({ nomination_id: nom.id, actor_id: 'emp_005' })
    // Force the record into a tier-2, approved state to simulate a
    // programmatic caller reaching undoApproval past the UI.
    updateMock(nom.id, { current_tier: 2 })

    const undone = await undoApproval({
      nomination_id: nom.id,
      actor_id: 'emp_005',
    })
    expect(undone.ok).toBe(false)
    if (undone.ok) return
    expect(undone.error.code).toBe('forbidden')
  })
})

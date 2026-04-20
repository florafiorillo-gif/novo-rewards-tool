/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { createNomination } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'

// Mock employees referenced (from modules/employees/mock-data.ts):
//   emp_001 Rares (CEO, no manager)
//   emp_005 Sarah Chen (VP Eng, manager=emp_001)
//   emp_006 Alex Rivera (SWE, manager=emp_005)
//   emp_007 Jamie Kim (PM, manager=emp_005)

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

beforeEach(() => {
  resetMockNominations()
})

describe('createNomination', () => {
  it('creates a peer nomination routed to the nominee manager', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nomination.status).toBe('submitted')
    expect(result.nomination.current_tier).toBe(1)
    expect(result.nomination.current_approver_id).toBe('emp_005')
    expect(result.routed_to_people_team).toBe(false)
    expect(result.duplicate_of_id).toBeNull()
  })

  it('routes a manager-initiated nomination to the manager themselves', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_005'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nomination.current_approver_id).toBe('emp_005')
  })

  it('routes to the People team queue (null approver) when nominee has no manager', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_001' },
      'emp_005'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nomination.current_approver_id).toBeNull()
    expect(result.routed_to_people_team).toBe(true)
  })

  it('blocks self-nomination', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_006'
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('self_nomination')
  })

  it('returns validation errors for too-short behavior text', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006', behavior_text: 'short' },
      'emp_007'
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('validation')
  })

  it('rejects unknown nominee ids', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_does_not_exist' },
      'emp_007'
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('nominee_not_found')
  })

  it('rejects unknown value ids at the schema layer', async () => {
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006', value_id: 'val_made_up' },
      'emp_007'
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('validation')
  })
})

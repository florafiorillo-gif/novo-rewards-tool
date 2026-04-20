/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  cancelNomination,
  createNomination,
} from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedFreshNomination() {
  const result = await createNomination(
    { ...baseInput, nominee_id: 'emp_006' },
    'emp_007'
  )
  if (!result.ok) throw new Error('seed failed')
  return result.nomination
}

beforeEach(() => {
  resetMockNominations()
})

describe('cancelNomination (spec §13.2, 24-hour window)', () => {
  it('cancels a nomination within the 24-hour window', async () => {
    const nom = await seedFreshNomination()
    const result = await cancelNomination(nom.id, 'emp_007')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nomination.status).toBe('cancelled')
  })

  it('refuses cancellation after 24 hours', async () => {
    const nom = await seedFreshNomination()
    const fakeNow = new Date(nom.submitted_at.getTime() + 25 * 60 * 60 * 1000)
    const result = await cancelNomination(nom.id, 'emp_007', fakeNow)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('window_expired')
  })

  it('refuses cancellation by anyone other than the nominator', async () => {
    const nom = await seedFreshNomination()
    const result = await cancelNomination(nom.id, 'emp_005')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('forbidden')
  })

  it('returns not_found for an unknown id', async () => {
    const result = await cancelNomination('nom_nope', 'emp_007')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('not_found')
  })

  it('refuses a second cancellation attempt', async () => {
    const nom = await seedFreshNomination()
    const first = await cancelNomination(nom.id, 'emp_007')
    expect(first.ok).toBe(true)
    const second = await cancelNomination(nom.id, 'emp_007')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('not_cancellable')
  })
})

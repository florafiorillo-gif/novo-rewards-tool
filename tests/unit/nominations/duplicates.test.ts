/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  createNomination,
  findRecentDuplicate,
} from '@/modules/nominations/service'
import {
  insertMock,
  resetMockNominations,
} from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

function seedNomination(overrides: Partial<NominationRecord>): NominationRecord {
  const now = new Date()
  return insertMock({
    id: overrides.id ?? `nom_seed_${Math.random().toString(36).slice(2)}`,
    nominator_id: 'emp_007',
    nominee_id: 'emp_006',
    value_id: 'val_run_for_the_bus',
    behavior_text: 'seed behavior text seed behavior text',
    outcome_text: 'seed outcome text seed outcome text',
    evidence_links: [],
    submitted_at: now,
    current_tier: 1,
    status: 'submitted',
    current_approver_id: 'emp_005',
    team_award_group_id: null,
    duplicate_of_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  })
}

beforeEach(() => {
  resetMockNominations()
})

describe('duplicate detection (signal only)', () => {
  it('links to the most recent prior nomination within 7 days', async () => {
    const earlier = seedNomination({
      submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    })
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.duplicate_of_id).toBe(earlier.id)
    expect(result.nomination.duplicate_of_id).toBe(earlier.id)
  })

  it('ignores nominations older than 7 days', async () => {
    seedNomination({
      submitted_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.duplicate_of_id).toBeNull()
  })

  it('does not flag different nominee/nominator pairs', async () => {
    seedNomination({ nominator_id: 'emp_007', nominee_id: 'emp_007' })
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.duplicate_of_id).toBeNull()
  })

  it('never blocks submission — still returns ok:true when a duplicate exists', async () => {
    seedNomination({})
    const result = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    expect(result.ok).toBe(true)
  })

  it('findRecentDuplicate returns the most recent match when several exist', async () => {
    const older = seedNomination({
      id: 'nom_older',
      submitted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    })
    const newer = seedNomination({
      id: 'nom_newer',
      submitted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    })
    const match = await findRecentDuplicate('emp_007', 'emp_006')
    expect(match?.id).toBe(newer.id)
    // Silence unused variable linter if tests add more assertions later
    expect(older.id).toBe('nom_older')
  })
})

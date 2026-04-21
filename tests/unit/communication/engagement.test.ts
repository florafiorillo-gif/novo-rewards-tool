/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  findNominationByPostTs,
  listComments,
  listReactions,
  recordComment,
  recordReaction,
  removeReaction,
  resetMockEngagement,
} from '@/modules/communication/engagement'
import { markPostFired } from '@/modules/communication/ack'
import { createNomination } from '@/modules/nominations/service'
import { approveNomination, resetMockApprovalActions } from '@/modules/approvals/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'

const base = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedApprovedWithPost(message_ts: string) {
  const created = await createNomination({ ...base, nominee_id: 'emp_006' }, 'emp_007')
  if (!created.ok) throw new Error('seed failed')
  const approved = await approveNomination({
    nomination_id: created.nomination.id,
    actor_id: 'emp_005',
  })
  if (!approved.ok) throw new Error('approve failed')
  await markPostFired(approved.nomination.id, message_ts)
  return approved.nomination
}

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
  resetMockEngagement()
})

describe('findNominationByPostTs', () => {
  it('maps a post ts back to its nomination', async () => {
    const nom = await seedApprovedWithPost('1700000001.000100')
    const found = await findNominationByPostTs('1700000001.000100')
    expect(found?.id).toBe(nom.id)
  })

  it('returns null for unknown ts', async () => {
    await seedApprovedWithPost('1700000001.000100')
    const found = await findNominationByPostTs('not_a_known_ts')
    expect(found).toBeNull()
  })
})

describe('recordReaction (spec §11.2)', () => {
  it('creates a reaction record the first time', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    const r = await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    expect(r.nomination_id).toBe(nom.id)
    const list = await listReactions(nom.id)
    expect(list.length).toBe(1)
  })

  it('is idempotent on (nomination, user, emoji)', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    const list = await listReactions(nom.id)
    expect(list.length).toBe(1)
  })

  it('two users can add the same emoji independently', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_007',
      reaction_type: 'tada',
    })
    const list = await listReactions(nom.id)
    expect(list.length).toBe(2)
  })

  it('the same user can add different emojis', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'heart',
    })
    const list = await listReactions(nom.id)
    expect(list.length).toBe(2)
  })
})

describe('removeReaction', () => {
  it('removes the matching reaction and returns true', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    await recordReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    const removed = await removeReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    expect(removed).toBe(true)
    const list = await listReactions(nom.id)
    expect(list.length).toBe(0)
  })

  it('returns false if no matching reaction exists', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    const removed = await removeReaction({
      nomination_id: nom.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    expect(removed).toBe(false)
  })
})

describe('recordComment', () => {
  it('creates a comment record with trimmed text', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    const c = await recordComment({
      nomination_id: nom.id,
      user_id: 'emp_005',
      text: '  Great work, Alex! ',
    })
    expect(c.text).toBe('Great work, Alex!')
    const list = await listComments(nom.id)
    expect(list.length).toBe(1)
  })

  it('rejects an empty or whitespace-only comment', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    await expect(
      recordComment({ nomination_id: nom.id, user_id: 'emp_005', text: '   ' })
    ).rejects.toThrow(/empty/)
  })

  it('multiple comments on the same nomination accumulate', async () => {
    const nom = await seedApprovedWithPost('ts_1')
    await recordComment({ nomination_id: nom.id, user_id: 'emp_005', text: 'first' })
    await recordComment({ nomination_id: nom.id, user_id: 'emp_007', text: 'second' })
    const list = await listComments(nom.id)
    expect(list.length).toBe(2)
  })
})

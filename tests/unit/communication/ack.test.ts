/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  acknowledgeNomination,
  firePostIfReady,
  markPostFired,
  POST_TIMEOUT_MS,
  runPostSweep,
  shouldFirePost,
  stubPostSender,
  _mockPatchForTests,
} from '@/modules/communication/ack'
import { approveNomination, resetMockApprovalActions } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { getNominationById } from '@/modules/nominations/service'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import type { RewardRecord } from '@/modules/rewards/types'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

// Spec: peer-path Tier 1 finalizes at approval (no second-step reward
// confirm), so it's the simplest way to land a nomination in a state
// where shouldFirePost can take over.
async function seedApprovedNomination() {
  const created = await createNomination(
    { ...baseInput, nominee_id: 'emp_006' },
    'emp_007'
  )
  if (!created.ok) throw new Error('seed nomination failed')
  const approved = await approveNomination({
    nomination_id: created.nomination.id,
    actor_id: 'emp_005',
  })
  if (!approved.ok) throw new Error('seed approve failed')
  return approved.nomination
}

function stubReward(overrides: Partial<RewardRecord> = {}): RewardRecord {
  return {
    id: 'rew_stub',
    nomination_id: overrides.nomination_id ?? 'nom_stub',
    reward_type: 'cash',
    vendor: null,
    amount_usd: 100,
    amount_local: null,
    currency_local: null,
    status: 'issued',
    delivery_mechanism: 'justworks_csv',
    scope_note_template_id: null,
    scope_note_text: null,
    issued_at: null,
    delivered_at: null,
    recipient_dm_scheduled_at: null,
    recipient_dm_sent_at: null,
    budget_exception: false,
    created_at: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
})

describe('acknowledgeNomination (spec §9.8)', () => {
  it('sets acknowledged_at when the nominee acknowledges', async () => {
    const nom = await seedApprovedNomination()
    const before = new Date(Date.now() - 1000)
    const res = await acknowledgeNomination(nom.id, 'emp_006')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.already).toBe(false)
    expect(res.nomination.acknowledged_at).toBeInstanceOf(Date)
    expect(res.nomination.acknowledged_at!.getTime()).toBeGreaterThan(before.getTime())
  })

  it("rejects when the actor isn't the recipient", async () => {
    const nom = await seedApprovedNomination()
    const res = await acknowledgeNomination(nom.id, 'emp_007') // nominator, not nominee
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('not_recipient')
  })

  it('rejects before the nomination is approved', async () => {
    const created = await createNomination(
      { ...baseInput, nominee_id: 'emp_006' },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    const res = await acknowledgeNomination(created.nomination.id, 'emp_006')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('not_approved')
  })

  it('is idempotent — a second ack leaves the original timestamp', async () => {
    const nom = await seedApprovedNomination()
    const first = await acknowledgeNomination(nom.id, 'emp_006')
    if (!first.ok) throw new Error('first ack failed')
    const originalTs = first.nomination.acknowledged_at!.getTime()
    const second = await acknowledgeNomination(nom.id, 'emp_006')
    if (!second.ok) throw new Error('second ack failed')
    expect(second.already).toBe(true)
    expect(second.nomination.acknowledged_at!.getTime()).toBe(originalTs)
  })

  it('returns not_found for an unknown nomination', async () => {
    const res = await acknowledgeNomination('nom_does_not_exist', 'emp_006')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('not_found')
  })
})

describe('markPostFired (idempotency)', () => {
  it('sets post_fired_at + post_message_ts the first time', async () => {
    const nom = await seedApprovedNomination()
    const result = await markPostFired(nom.id, '1700000000.000100')
    expect(result.fired).toBe(true)
    expect(result.nomination?.post_fired_at).toBeInstanceOf(Date)
    expect(result.nomination?.post_message_ts).toBe('1700000000.000100')
  })

  it('returns fired=false if called again', async () => {
    const nom = await seedApprovedNomination()
    await markPostFired(nom.id, '1700000000.000100')
    const second = await markPostFired(nom.id, '1700000000.999999')
    expect(second.fired).toBe(false)
    // Original message_ts preserved.
    expect(second.nomination?.post_message_ts).toBe('1700000000.000100')
  })
})

describe('shouldFirePost (pure predicate)', () => {
  it('returns true when nomination is acknowledged and not yet posted', async () => {
    const nom = await seedApprovedNomination()
    await acknowledgeNomination(nom.id, 'emp_006')
    const updated = await getNominationById(nom.id)
    expect(shouldFirePost(updated!, stubReward(), new Date())).toBe(true)
  })

  it('returns false if already posted, regardless of ack', async () => {
    const nom = await seedApprovedNomination()
    await acknowledgeNomination(nom.id, 'emp_006')
    await markPostFired(nom.id, 'ts')
    const updated = await getNominationById(nom.id)
    expect(shouldFirePost(updated!, stubReward(), new Date())).toBe(false)
  })

  it('returns true after the 24h timeout elapsed since recipient_dm_sent_at', async () => {
    const nom = await seedApprovedNomination()
    const dmSent = new Date(Date.now() - POST_TIMEOUT_MS - 1000)
    const now = new Date()
    const reward = stubReward({ recipient_dm_sent_at: dmSent, nomination_id: nom.id })
    expect(shouldFirePost(nom, reward, now)).toBe(true)
  })

  it('returns false when under 24h have elapsed and no ack', async () => {
    const nom = await seedApprovedNomination()
    const dmSent = new Date(Date.now() - 1000) // 1s ago
    const reward = stubReward({ recipient_dm_sent_at: dmSent, nomination_id: nom.id })
    expect(shouldFirePost(nom, reward, new Date())).toBe(false)
  })

  it('falls back to reward.issued_at if recipient_dm_sent_at is null (pre-6E data)', async () => {
    const nom = await seedApprovedNomination()
    const issuedAt = new Date(Date.now() - POST_TIMEOUT_MS - 1000)
    const reward = stubReward({
      issued_at: issuedAt,
      recipient_dm_sent_at: null,
      nomination_id: nom.id,
    })
    expect(shouldFirePost(nom, reward, new Date())).toBe(true)
  })

  it('returns false with no reward record at all (pre-reward)', async () => {
    const nom = await seedApprovedNomination()
    expect(shouldFirePost(nom, null, new Date())).toBe(false)
  })
})

describe('firePostIfReady', () => {
  it('invokes the sender and marks post_fired_at when ready', async () => {
    const nom = await seedApprovedNomination()
    await acknowledgeNomination(nom.id, 'emp_006')
    const calls: string[] = []
    const sender = async () => {
      calls.push('called')
      return { message_ts: 'sent_ts' }
    }
    const res = await firePostIfReady(nom.id, sender)
    expect(res.fired).toBe(true)
    expect(res.message_ts).toBe('sent_ts')
    expect(calls.length).toBe(1)
    const after = await getNominationById(nom.id)
    expect(after?.post_message_ts).toBe('sent_ts')
    expect(after?.post_fired_at).toBeInstanceOf(Date)
  })

  it('does nothing when shouldFirePost returns false', async () => {
    const nom = await seedApprovedNomination()
    // Not ack'd, no DM timeout elapsed, reward has no issued_at
    const calls: string[] = []
    const sender = async () => {
      calls.push('called')
      return { message_ts: 't' }
    }
    const res = await firePostIfReady(nom.id, sender)
    expect(res.fired).toBe(false)
    expect(calls.length).toBe(0)
  })
})

describe('runPostSweep', () => {
  it('fires exactly the nominations that are eligible', async () => {
    // A: acked → should fire.
    // B: not acked and (simulated) DM sent < 24h ago → should NOT fire.
    // C: already posted → should NOT fire.
    const a = await seedApprovedNomination()
    await acknowledgeNomination(a.id, 'emp_006')

    // B: a separate nominee so both coexist in the store.
    const createdB = await createNomination(
      { ...baseInput, nominee_id: 'emp_009' },
      'emp_007'
    )
    if (!createdB.ok) throw new Error('seedB failed')
    const approvedB = await approveNomination({
      nomination_id: createdB.nomination.id,
      actor_id: 'emp_008',
    })
    if (!approvedB.ok) throw new Error('approveB failed')

    // C: already posted.
    const createdC = await createNomination(
      { ...baseInput, nominee_id: 'emp_007' },
      'emp_006'
    )
    if (!createdC.ok) throw new Error('seedC failed')
    const approvedC = await approveNomination({
      nomination_id: createdC.nomination.id,
      actor_id: 'emp_005',
    })
    if (!approvedC.ok) throw new Error('approveC failed')
    _mockPatchForTests(approvedC.nomination.id, { post_fired_at: new Date() })

    const calls: string[] = []
    const sender = async (nom: { id: string }) => {
      calls.push(nom.id)
      return { message_ts: null }
    }
    const result = await runPostSweep(sender, new Date())
    expect(result.fired).toEqual([a.id])
    expect(result.skipped).toContain(approvedB.nomination.id)
    // C is filtered out at the loadCandidates step (post_fired_at != null).
    expect(result.skipped).not.toContain(approvedC.nomination.id)
    expect(calls.length).toBe(1)
  })

  it('stubPostSender never throws', async () => {
    const out = await stubPostSender({
      id: 'n',
      // minimal mock; stubPostSender ignores the record
    } as never)
    expect(out.message_ts).toBeNull()
  })
})

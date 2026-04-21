/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  onRewardIssued,
  runRecipientDMSweep,
  RECIPIENT_DM_TIMEOUT_MS,
} from '@/modules/communication/recipient-dm'
import {
  insertMockReward,
  resetMockRewards,
  findMockRewardById,
} from '@/modules/rewards/mock-store'
import type { RewardRecord } from '@/modules/rewards/types'

function rew(overrides: Partial<RewardRecord> = {}): RewardRecord {
  return {
    id: 'rew_test',
    nomination_id: 'nom_test',
    reward_type: 'cash',
    vendor: null,
    amount_usd: 100,
    amount_local: null,
    currency_local: null,
    status: 'issued',
    delivery_mechanism: 'justworks_csv',
    scope_note_template_id: null,
    scope_note_text: null,
    issued_at: new Date(),
    delivered_at: null,
    recipient_dm_scheduled_at: null,
    recipient_dm_sent_at: null,
    budget_exception: false,
    created_at: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  resetMockRewards()
  // Ensure no live Slack — forces "never active" path in isRecipientActive.
  delete process.env.SLACK_BOT_TOKEN
})

describe('onRewardIssued (spec §9.4)', () => {
  it('stamps recipient_dm_scheduled_at when first called', async () => {
    insertMockReward(rew({ id: 'rew_a' }))
    const before = Date.now()
    const res = await onRewardIssued({ reward_id: 'rew_a' })
    expect(res.sent).toBe(false) // presence inactive in test env
    const after = findMockRewardById('rew_a')!
    expect(after.recipient_dm_scheduled_at).toBeInstanceOf(Date)
    expect(after.recipient_dm_scheduled_at!.getTime()).toBeGreaterThanOrEqual(before)
    expect(after.recipient_dm_sent_at).toBeNull()
  })

  it('is a no-op if already sent', async () => {
    const existing = new Date(Date.now() - 1000)
    insertMockReward(
      rew({
        id: 'rew_b',
        recipient_dm_scheduled_at: existing,
        recipient_dm_sent_at: existing,
      })
    )
    const res = await onRewardIssued({ reward_id: 'rew_b' })
    expect(res.sent).toBe(true)
    const after = findMockRewardById('rew_b')!
    expect(after.recipient_dm_sent_at!.getTime()).toBe(existing.getTime())
  })

  it('returns sent=false silently for unknown reward id', async () => {
    const res = await onRewardIssued({ reward_id: 'rew_does_not_exist' })
    expect(res.sent).toBe(false)
  })
})

describe('runRecipientDMSweep', () => {
  it('sends any reward whose scheduled_at is older than the 24h fallback', async () => {
    const long_ago = new Date(Date.now() - RECIPIENT_DM_TIMEOUT_MS - 1000)
    insertMockReward(
      rew({ id: 'rew_timed_out', recipient_dm_scheduled_at: long_ago })
    )
    const result = await runRecipientDMSweep()
    expect(result.sent).toEqual(['rew_timed_out'])
    const after = findMockRewardById('rew_timed_out')!
    expect(after.recipient_dm_sent_at).toBeInstanceOf(Date)
  })

  it('waits on rewards whose 24h hasn\'t elapsed and presence is inactive', async () => {
    insertMockReward(
      rew({
        id: 'rew_waiting',
        recipient_dm_scheduled_at: new Date(Date.now() - 1000),
      })
    )
    const result = await runRecipientDMSweep()
    expect(result.waiting).toEqual(['rew_waiting'])
    expect(result.sent).toEqual([])
    const after = findMockRewardById('rew_waiting')!
    expect(after.recipient_dm_sent_at).toBeNull()
  })

  it('skips rewards already sent', async () => {
    const past = new Date(Date.now() - 1000)
    insertMockReward(
      rew({
        id: 'rew_already',
        recipient_dm_scheduled_at: past,
        recipient_dm_sent_at: past,
      })
    )
    const result = await runRecipientDMSweep()
    expect(result.skipped).toEqual(['rew_already'])
    expect(result.sent).toEqual([])
  })

  it('skips rewards that have never been scheduled (reward not yet issued)', async () => {
    insertMockReward(rew({ id: 'rew_not_scheduled' }))
    const result = await runRecipientDMSweep()
    expect(result.skipped).toEqual(['rew_not_scheduled'])
  })
})

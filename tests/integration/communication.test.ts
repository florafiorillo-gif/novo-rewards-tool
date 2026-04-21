/** @jest-environment node */
import { db } from '@/lib/db'
import { allocatePools } from '@/modules/budget/allocation'
import {
  activatePeriod,
  approvePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { approveNomination } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { createCatalogItem } from '@/modules/catalog/service'
import { markRewardIssued, selectReward } from '@/modules/rewards/service'
import {
  acknowledgeNomination,
  firePostIfReady,
  markPostFired,
  runPostSweep,
  POST_TIMEOUT_MS,
} from '@/modules/communication/ack'
import {
  onRewardIssued,
  runRecipientDMSweep,
  RECIPIENT_DM_TIMEOUT_MS,
} from '@/modules/communication/recipient-dm'
import {
  listComments,
  listReactions,
  recordComment,
  recordReaction,
  removeReaction,
} from '@/modules/communication/engagement'
import {
  setRecognitionPreference,
  getEmployeeById,
} from '@/modules/employees/service'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

describeIntegration('Phase 6 end-to-end (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
    const period = await createPeriod({
      period_label: 'Q2 2026 (comms integration)',
      start_date: new Date(Date.now() - 1_000),
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      total_allocation_usd: 100_000,
    })
    if (!period.ok) throw new Error('period')
    await allocatePools(period.period.id)
    await approvePeriod(period.period.id, 'emp_001')
    await approvePeriod(period.period.id, 'emp_002')
    await activatePeriod(period.period.id)
  })

  afterAll(async () => {
    await disconnect()
  })

  async function seedApprovedReward(nominee_id = 'emp_006') {
    const item = await createCatalogItem({
      geo: 'US',
      reward_type: 'gift_card',
      name: 'Integration gift card',
      description: 'test',
      amount_usd: 100,
    })
    const nom = await createNomination(
      {
        nominee_id,
        value_id: 'val_run_for_the_bus',
        behavior_text:
          'Shipped the migration on a tight deadline after the reviewer was out.',
        outcome_text:
          'We saved the launch window and avoided a partial rollback.',
        evidence_links: [],
      },
      'emp_007'
    )
    if (!nom.ok) throw new Error('create')
    const approved = await approveNomination({
      nomination_id: nom.nomination.id,
      actor_id: 'emp_005',
    })
    if (!approved.ok) throw new Error('approve')
    const selected = await selectReward({
      nomination_id: nom.nomination.id,
      actor_id: 'emp_005',
      catalog_item_id: item.id,
      custom: null,
      scope_note_template_id: null,
      scope_note_text: 'Exactly the kind of ownership I want to see more of.',
      budget_exception: false,
    })
    if (!selected.ok) throw new Error('select')
    return { nomination: nom.nomination, reward: selected.reward }
  }

  it('recipient_preference persists via settings update', async () => {
    await setRecognitionPreference('emp_006', 'private')
    const after = await getEmployeeById('emp_006')
    expect(after?.recognition_preference).toBe('private')
  })

  it('issue → schedule DM (presence off) → timeout sweep marks sent', async () => {
    const { reward } = await seedApprovedReward()
    await markRewardIssued({ reward_id: reward.id, vendor_reference_id: null })
    await onRewardIssued({ reward_id: reward.id })

    // Immediate call: presence unavailable (no SLACK_BOT_TOKEN) → waiting.
    let row = await db.reward.findUniqueOrThrow({ where: { id: reward.id } })
    expect(row.recipient_dm_scheduled_at).not.toBeNull()
    expect(row.recipient_dm_sent_at).toBeNull()

    // Advance the scheduled time past the 24h fallback and sweep.
    await db.reward.update({
      where: { id: reward.id },
      data: {
        recipient_dm_scheduled_at: new Date(
          Date.now() - RECIPIENT_DM_TIMEOUT_MS - 1000
        ),
      },
    })
    const result = await runRecipientDMSweep()
    expect(result.sent).toContain(reward.id)
    row = await db.reward.findUniqueOrThrow({ where: { id: reward.id } })
    expect(row.recipient_dm_sent_at).not.toBeNull()
  })

  it('ack → post fired (via stub sender); sweep is a no-op for posted nominations', async () => {
    const { nomination, reward } = await seedApprovedReward()
    await markRewardIssued({ reward_id: reward.id, vendor_reference_id: null })
    await onRewardIssued({ reward_id: reward.id })
    // Simulate DM sent so the ack path has a clean anchor.
    await db.reward.update({
      where: { id: reward.id },
      data: { recipient_dm_sent_at: new Date() },
    })

    const ack = await acknowledgeNomination(nomination.id, 'emp_006')
    expect(ack.ok).toBe(true)

    let calls = 0
    const sender = async () => {
      calls++
      return { message_ts: '1700000000.000100' }
    }
    const fired = await firePostIfReady(nomination.id, sender)
    expect(fired.fired).toBe(true)
    expect(fired.message_ts).toBe('1700000000.000100')
    expect(calls).toBe(1)

    const sweep = await runPostSweep(sender)
    expect(sweep.fired).not.toContain(nomination.id)
    expect(calls).toBe(1) // sender not invoked again

    const row = await db.nomination.findUniqueOrThrow({
      where: { id: nomination.id },
    })
    expect(row.post_fired_at).not.toBeNull()
    expect(row.post_message_ts).toBe('1700000000.000100')
  })

  it('24h post timeout sweep fires nominations that were never acked', async () => {
    const { nomination, reward } = await seedApprovedReward('emp_009')
    await markRewardIssued({ reward_id: reward.id, vendor_reference_id: null })
    await db.reward.update({
      where: { id: reward.id },
      data: {
        recipient_dm_sent_at: new Date(Date.now() - POST_TIMEOUT_MS - 5000),
      },
    })
    const fired: string[] = []
    const sender = async (n: { id: string }) => {
      fired.push(n.id)
      return { message_ts: 'ts_after_timeout' }
    }
    const sweep = await runPostSweep(sender)
    expect(sweep.fired).toContain(nomination.id)
    expect(fired).toEqual([nomination.id])
  })

  it('reactions + comments round-trip and are keyed by nomination via post_message_ts', async () => {
    const { nomination } = await seedApprovedReward('emp_010')
    await markPostFired(nomination.id, 'ts_react_integration')

    await recordReaction({
      nomination_id: nomination.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    await recordReaction({
      nomination_id: nomination.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    }) // idempotent
    await recordReaction({
      nomination_id: nomination.id,
      user_id: 'emp_007',
      reaction_type: 'heart',
    })
    const reactions = await listReactions(nomination.id)
    expect(reactions.length).toBe(2)

    await removeReaction({
      nomination_id: nomination.id,
      user_id: 'emp_005',
      reaction_type: 'tada',
    })
    expect((await listReactions(nomination.id)).length).toBe(1)

    await recordComment({
      nomination_id: nomination.id,
      user_id: 'emp_005',
      text: 'Saw this happen first-hand — great save.',
    })
    const comments = await listComments(nomination.id)
    expect(comments.length).toBe(1)
    expect(comments[0].text).toContain('first-hand')
  })
})

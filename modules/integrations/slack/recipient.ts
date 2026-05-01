import { getSlackClient } from './client'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { getNominationById } from '@/modules/nominations/service'
import { buildRecipientDMBlocks } from './blocks/recipient-dm'
import type { RewardRecord } from '@/modules/rewards/types'
import type { NominationRecord } from '@/modules/nominations/types'

// Spec §9.4 — recipient gets a short DM when the reward is issued, with a
// "React to acknowledge" button (spec §9.8). Clicking fires the
// #made-it-happen post; a 24h timer auto-fires the post regardless.
// Phase 5 fired immediately on status=issued; Phase 6E adds presence-aware
// timing. This module only composes and sends the DM — ack state lives in
// modules/communication/ack.ts.

function slackEnabled(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN)
}

async function openDMChannel(email: string): Promise<string | null> {
  try {
    const client = getSlackClient()
    const user = await client.users.lookupByEmail({ email })
    const userId = user.user?.id
    if (!userId) return null
    const conv = await client.conversations.open({ users: userId })
    return conv.channel?.id ?? null
  } catch {
    return null
  }
}

export async function sendRecipientRewardDM(args: {
  reward: RewardRecord
  nomination_id: string
}): Promise<void> {
  if (!slackEnabled()) return
  const nomination = await getNominationById(args.nomination_id)
  if (!nomination) return
  const [nominator, nominee] = await Promise.all([
    getEmployeeById(nomination.nominator_id),
    getEmployeeById(nomination.nominee_id),
  ])
  if (!nominee || !nominator) return
  const value = getValueById(nomination.value_id)

  const channel = await openDMChannel(nominee.email)
  if (!channel) return

  const rewardLine = describeReward(args.reward, nominee.geo)
  const deliveryLine = describeDelivery(args.reward)

  const blocks = buildRecipientDMBlocks({
    nomination_id: nomination.id,
    nominee_name: nominee.name,
    nominator_name: nominator.name,
    value_name: value?.name ?? 'a Novo value',
    behavior_text: nomination.behavior_text,
    reward_line: rewardLine,
    delivery_line: deliveryLine,
    already_acknowledged: Boolean(nomination.acknowledged_at),
  })

  try {
    await getSlackClient().chat.postMessage({
      channel,
      blocks,
      // Fallback text for clients that can't render blocks (and for
      // Slack's own notification preview text).
      text:
        `${nominee.name}, you've been recognized. ` +
        `${nominator.name} saw you live ${value?.name ?? 'a Novo value'}.`,
    })
  } catch (err) {
    console.error('[slack] recipient reward DM failed', err)
  }
}

function describeReward(reward: RewardRecord, _geo: string): string {
  if (reward.reward_type === 'cash') {
    return `cash bonus of $${reward.amount_usd.toLocaleString()}`
  }
  const vendorBit = reward.vendor ? ` from ${reward.vendor}` : ''
  const typeBit =
    reward.reward_type === 'gift_card'
      ? 'gift card'
      : reward.reward_type === 'experience'
      ? 'experience'
      : reward.reward_type === 'l_and_d'
      ? 'learning credit'
      : 'custom reward'
  return `${typeBit}${vendorBit}`
}

function describeDelivery(reward: RewardRecord): string {
  switch (reward.delivery_mechanism) {
    case 'tremendous':
      return 'Details coming to your email shortly.'
    case 'justworks_csv':
      return 'Included in your next off-cycle paycheck.'
    case 'zoho_payroll':
      return 'Included in your next Zoho payroll cycle.'
    case 'manual':
      return 'The People team will reach out with details.'
    default:
      return 'Details coming soon.'
  }
}

// ─── Peer recognition (Round 5) ──────────────────────────────────────
// Lightweight DM fired right after a peer-recognition record is
// created. No reward, no acknowledge button, no 24h timer — just a
// short notification so the recipient sees they were recognized.
// No-op when SLACK_BOT_TOKEN is unset (mock / local dev).
export async function sendPeerRecognitionDM(args: {
  nomination: NominationRecord
}): Promise<void> {
  if (!slackEnabled()) return
  const { nomination } = args
  const [nominator, nominee] = await Promise.all([
    getEmployeeById(nomination.nominator_id),
    getEmployeeById(nomination.nominee_id),
  ])
  if (!nominee || !nominator) return
  const value = getValueById(nomination.value_id)

  const channel = await openDMChannel(nominee.email)
  if (!channel) return

  // First sentence (or full text up to 200 chars) of the behavior
  // narrative. Keeps the DM short — full record is in the web app.
  const behaviorSummary = summarize(nomination.behavior_text, 200)
  const valueName = value?.name ?? 'a Novo value'

  try {
    await getSlackClient().chat.postMessage({
      channel,
      text:
        `${nominator.name} recognized you for ${valueName}: ` +
        `“${behaviorSummary}”. See your dashboard for the full note.`,
    })
  } catch (err) {
    console.error('[slack] peer recognition DM failed', err)
  }
}

function summarize(raw: string, max: number): string {
  const trimmed = raw.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1).trimEnd() + '…'
}

import { getSlackClient } from './client'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { getNominationById } from '@/modules/nominations/service'
import type { RewardRecord } from '@/modules/rewards/types'

// Spec §9.4 — recipient gets a short DM when the reward is issued.
// Phase 5 fires immediately on status=issued; Phase 6 adds the active-
// aware timing ("when Slack presence is active, or auto-fire at 24h").
// Respects recipient.recognition_preference — private recipients only
// get the DM (no channel post), which is Phase 6's concern anyway.

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

  try {
    await getSlackClient().chat.postMessage({
      channel,
      text:
        `${nominee.name}, you've been recognized.\n` +
        `${nominator.name} saw you live ${value?.name ?? 'a Novo value'}:\n` +
        `"${nomination.behavior_text}"\n` +
        `Your reward: ${rewardLine}.\n` +
        deliveryLine,
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

import { db } from '@/lib/db'
import { getEmployeeById } from '@/modules/employees/service'
import { getSlackClient } from '@/modules/integrations/slack/client'
import { sendRecipientRewardDM } from '@/modules/integrations/slack/recipient'
import {
  getReward,
  getRewardForNomination,
  listRewards,
} from '@/modules/rewards/service'
import { updateMockReward } from '@/modules/rewards/mock-store'
import type { RewardRecord } from '@/modules/rewards/types'

// Spec §9.4 — recipient DM fires when Slack presence is active (proxy for
// "awake in their time zone") or 24h after scheduling, whichever is first.
//
// Flow:
//   1. markRewardIssued calls onRewardIssued(reward_id).
//   2. onRewardIssued stamps recipient_dm_scheduled_at = now, then tries
//      to send immediately if presence is active.
//   3. Cron runs runRecipientDMSweep every ~5 min. For each reward with
//      scheduled_at set but sent_at null, it checks presence (or timeout)
//      and sends when ready.
// Sent state transitions the reward's recipient_dm_sent_at, which is also
// the anchor the #made-it-happen-post 24h timer keys on (ack.shouldFirePost).

export const RECIPIENT_DM_TIMEOUT_MS = 24 * 60 * 60 * 1000

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export async function onRewardIssued(args: {
  reward_id: string
  now?: Date
}): Promise<{ sent: boolean }> {
  const now = args.now ?? new Date()
  const reward = await getReward(args.reward_id)
  if (!reward) return { sent: false }
  if (reward.recipient_dm_sent_at) return { sent: true }

  if (!reward.recipient_dm_scheduled_at) {
    await patchReward(reward.id, { recipient_dm_scheduled_at: now })
    reward.recipient_dm_scheduled_at = now
  }
  return trySendIfReady(reward, now)
}

export async function runRecipientDMSweep(
  now: Date = new Date()
): Promise<{ sent: string[]; waiting: string[]; skipped: string[] }> {
  const rewards = await listRewards()
  const sent: string[] = []
  const waiting: string[] = []
  const skipped: string[] = []
  for (const reward of rewards) {
    if (!reward.recipient_dm_scheduled_at || reward.recipient_dm_sent_at) {
      skipped.push(reward.id)
      continue
    }
    const res = await trySendIfReady(reward, now)
    if (res.sent) sent.push(reward.id)
    else waiting.push(reward.id)
  }
  return { sent, waiting, skipped }
}

async function trySendIfReady(
  reward: RewardRecord,
  now: Date
): Promise<{ sent: boolean }> {
  if (!reward.recipient_dm_scheduled_at) return { sent: false }
  const elapsed = now.getTime() - reward.recipient_dm_scheduled_at.getTime()
  const timedOut = elapsed >= RECIPIENT_DM_TIMEOUT_MS

  if (!timedOut) {
    const active = await isRecipientActive(reward)
    if (!active) return { sent: false }
  }

  await sendRecipientRewardDM({
    reward,
    nomination_id: reward.nomination_id,
  })
  await patchReward(reward.id, { recipient_dm_sent_at: now })
  return { sent: true }
}

async function isRecipientActive(reward: RewardRecord): Promise<boolean> {
  // Mock / no-Slack dev treats "active" as false, which means the DM
  // never goes out until the 24h timeout. That matches the spec fallback
  // and keeps local runs deterministic.
  const client = getSlackClient()
  if (!client) return false
  try {
    const email = await resolveRecipientEmail(reward.nomination_id)
    if (!email) return false
    const lookup = await client.users.lookupByEmail({ email })
    const slackUserId = lookup.user?.id
    if (!slackUserId) return false
    const presence = await client.users.getPresence({ user: slackUserId })
    return presence.presence === 'active'
  } catch {
    return false
  }
}

async function resolveRecipientEmail(nomination_id: string): Promise<string | null> {
  const reward = await getRewardForNomination(nomination_id)
  if (!reward) return null
  const { getNominationById } = await import('@/modules/nominations/service')
  const nom = await getNominationById(nomination_id)
  if (!nom) return null
  const nominee = await getEmployeeById(nom.nominee_id)
  return nominee?.email ?? null
}

async function patchReward(
  reward_id: string,
  patch: Partial<RewardRecord>
): Promise<void> {
  if (useMock()) {
    updateMockReward(reward_id, patch)
    return
  }
  // Strip fields the DB column set doesn't accept; budget_exception is
  // an in-memory flag only (tracked via BudgetException rows).
  const { budget_exception: _omitException, ...dbPatch } = patch
  await db.reward.update({
    where: { id: reward_id },
    data: dbPatch as never,
  })
}

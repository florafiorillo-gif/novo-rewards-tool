'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import {
  markRewardDelivered,
  markRewardFailed,
  markRewardIssued,
  getReward,
} from '@/modules/rewards/service'
import { onRewardIssued } from '@/modules/communication/recipient-dm'

async function requirePeopleOps(): Promise<void> {
  const session = await auth()
  const id = session?.user?.employeeId
  if (!id) throw new Error('Not authenticated')
  if (!(await isPeopleTeamRep(id))) throw new Error('Not authorized')
}

export async function markIssuedAction(formData: FormData): Promise<void> {
  await requirePeopleOps()
  const rewardId = (formData.get('reward_id') ?? '').toString()
  if (!rewardId) return
  const result = await markRewardIssued({
    reward_id: rewardId,
    vendor_reference_id: null,
  })
  if (result.ok) {
    // Schedule the recipient DM — spec §9.4 presence-gated, 24h fallback
    // (Phase 6E). onRewardIssued stamps scheduled_at and sends immediately
    // if Slack presence is active; otherwise the cron sweep picks it up.
    await onRewardIssued({ reward_id: result.reward.id })
  }
  revalidatePath('/people-ops/fulfillment')
}

export async function markDeliveredAction(formData: FormData): Promise<void> {
  await requirePeopleOps()
  const rewardId = (formData.get('reward_id') ?? '').toString()
  if (!rewardId) return
  await markRewardDelivered({ reward_id: rewardId })
  revalidatePath('/people-ops/fulfillment')
}

export async function markFailedAction(formData: FormData): Promise<void> {
  await requirePeopleOps()
  const rewardId = (formData.get('reward_id') ?? '').toString()
  const reason = (formData.get('reason') ?? '').toString().trim() || 'Unknown'
  if (!rewardId) return
  await markRewardFailed({ reward_id: rewardId, reason })
  revalidatePath('/people-ops/fulfillment')
}

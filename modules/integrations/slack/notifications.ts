import { getSlackClient } from './client'
import { buildApproverDM } from './blocks/approver-dm'
import { buildApprovedEphemeral } from './blocks/approved-ephemeral'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import type { NominationRecord } from '@/modules/nominations/types'

// Slack is optional locally. All helpers no-op when SLACK_BOT_TOKEN is missing
// or when the lookup fails (employee has no Slack account yet). This keeps
// mock-mode dev functional without credentials.

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

// Spec §7.1 — three-button DM to the nominee's manager on peer-initiated
// Tier 1 nominations. Returns the sent message's {channel, ts} so the caller
// can store it if it wants to chat.update later (Phase 3 doesn't need to —
// interactivity payloads carry channel + message_ts on button clicks).
export async function sendApproverDM(
  nomination: NominationRecord
): Promise<{ channel: string; ts: string } | null> {
  if (!slackEnabled()) return null
  if (!nomination.current_approver_id) return null

  const [approver, nominator, nominee] = await Promise.all([
    getEmployeeById(nomination.current_approver_id),
    getEmployeeById(nomination.nominator_id),
    getEmployeeById(nomination.nominee_id),
  ])
  if (!approver || !nominator || !nominee) return null

  const value = getValueById(nomination.value_id)
  const channel = await openDMChannel(approver.email)
  if (!channel) return null

  try {
    const res = await getSlackClient().chat.postMessage({
      channel,
      text: `New recognition nomination to review: ${nominee.name}`,
      blocks: buildApproverDM({
        nomination,
        nominator_name: nominator.name,
        nominee_name: nominee.name,
        value_name: value?.name ?? 'a Novo value',
      }),
    })
    if (!res.ts) return null
    return { channel, ts: res.ts }
  } catch {
    return null
  }
}

// Spec §9.2 — fires on final approval if nominator != actor (self-approval
// skips this; the manager already sees their own confirmation).
export async function sendNominatorApprovalDM(args: {
  nomination: NominationRecord
  nominator_name: string
  nominator_email: string
  nominee_name: string
  value_name: string
}): Promise<void> {
  if (!slackEnabled()) return
  const channel = await openDMChannel(args.nominator_email)
  if (!channel) return
  try {
    const first = args.nominator_name.split(' ')[0]
    await getSlackClient().chat.postMessage({
      channel,
      text: `Thank you, ${first}. ${args.nominee_name} has been recognized for ${args.value_name}.`,
    })
  } catch {
    // Silent — nominator will see the outcome in the web dashboard regardless.
  }
}

// Spec §9.3 — nominator sees denial reason in the approver's own words.
export async function sendNominatorDenialDM(args: {
  nominator_email: string
  nominee_name: string
  approver_name: string
  reason_text: string
}): Promise<void> {
  if (!slackEnabled()) return
  const channel = await openDMChannel(args.nominator_email)
  if (!channel) return
  try {
    await getSlackClient().chat.postMessage({
      channel,
      text:
        `Your nomination of ${args.nominee_name} was not approved. ${args.reason_text}\n` +
        `If you'd like to discuss or resubmit, talk with ${args.approver_name}.`,
    })
  } catch {
    // Silent.
  }
}

// Update the approver's own DM in place after they act. Removes the action
// buttons and surfaces an Undo button for 10 minutes (spec §13.3).
//
// Returns true on a successful update, false on Slack-disabled or failure
// so callers can post a follow-up ephemeral confirming the underlying
// action (the approval already succeeded; only the DM-rewrite failed).
// Stale buttons that look clickable are worse than no feedback.
export async function updateApproverDMToApproved(args: {
  channel: string
  ts: string
  nominee_name: string
  value_name: string
  nomination_id: string
}): Promise<boolean> {
  if (!slackEnabled()) return false
  try {
    await getSlackClient().chat.update({
      channel: args.channel,
      ts: args.ts,
      text: `Approved. ${args.nominee_name} will be recognized.`,
      blocks: buildApprovedEphemeral({
        nominee_name: args.nominee_name,
        value_name: args.value_name,
        nomination_id: args.nomination_id,
      }),
    })
    return true
  } catch (err) {
    console.error('[slack] approver DM update failed', err)
    return false
  }
}

// Spec §7.5 urgent path — committee gets a Slack ping instead of waiting
// for the monthly meeting. Fires alongside the usual queue entry.
export async function pingCommitteeUrgent(args: {
  nomination_id: string
  nominee_name: string
  value_name: string
  committee_emails: string[]
}): Promise<void> {
  if (!slackEnabled()) return
  for (const email of args.committee_emails) {
    const channel = await openDMChannel(email)
    if (!channel) continue
    try {
      await getSlackClient().chat.postMessage({
        channel,
        text:
          `Urgent Tier 3 recognition waiting for review: ${args.nominee_name} (${args.value_name}). ` +
          `Please review in the committee queue.`,
      })
    } catch {
      // Silent.
    }
  }
}

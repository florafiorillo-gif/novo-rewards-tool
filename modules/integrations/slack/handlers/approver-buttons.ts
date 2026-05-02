import { approveNomination, undoApproval } from '@/modules/approvals/service'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { getSlackClient } from '../client'
import {
  ACTION_APPROVE_T1,
  ACTION_PROPOSE_UPGRADE_T1,
  ACTION_REVIEW_AND_DECIDE_T1,
} from '../blocks/approver-dm'
import { ACTION_UNDO_APPROVAL } from '../blocks/approved-ephemeral'
import { buildUpgradeModal } from '../blocks/upgrade-modal'
import {
  sendNominatorApprovalDM,
  updateApproverDMToApproved,
} from '../notifications'
import type { SlackInteractivityPayload } from '../payloads'
import { resolveSlackUserToEmployee, respondEphemeral } from './shared'

export async function onApproveButton(
  payload: SlackInteractivityPayload
): Promise<void> {
  const nominationId = payload.actions?.[0]?.value
  if (!nominationId) return
  const slackUserId = payload.user?.id
  const actor = slackUserId ? await resolveSlackUserToEmployee(slackUserId) : null
  if (!actor) {
    await respondEphemeral(payload, "We couldn't find your record in our directory.")
    return
  }

  const result = await approveNomination({
    nomination_id: nominationId,
    actor_id: actor.id,
  })
  if (!result.ok) {
    await respondEphemeral(payload, errorTextForApprove(result.error.code))
    return
  }

  const [nominator, nominee] = await Promise.all([
    getEmployeeById(result.nomination.nominator_id),
    getEmployeeById(result.nomination.nominee_id),
  ])
  const value = getValueById(result.nomination.value_id)

  const channel = payload.container?.channel_id ?? payload.channel?.id
  const ts = payload.container?.message_ts ?? payload.message?.ts
  if (channel && ts && nominee && value) {
    const updated = await updateApproverDMToApproved({
      channel,
      ts,
      nominee_name: nominee.name,
      value_name: value.name,
      nomination_id: nominationId,
    })
    if (!updated) {
      // Approval succeeded but the DM rewrite failed (Slack disabled,
      // network blip, message expired, etc.). Surface an ephemeral
      // follow-up so the approver isn't left wondering whether the
      // click registered. Stale-but-clickable buttons stay above; the
      // ephemeral nudges them to refresh.
      await respondEphemeral(
        payload,
        `Approved. ${nominee.name} will be recognized. The buttons above didn't refresh — please refresh Slack to see the latest.`
      )
    }
  }

  // Spec §9.2 — nominator DM only when nominator != actor.
  if (nominator && nominee && value && nominator.id !== actor.id) {
    await sendNominatorApprovalDM({
      nomination: result.nomination,
      nominator_name: nominator.name,
      nominator_email: nominator.email,
      nominee_name: nominee.name,
      value_name: value.name,
    })
  }
}

export async function onProposeUpgradeButton(
  payload: SlackInteractivityPayload
): Promise<void> {
  const nominationId = payload.actions?.[0]?.value
  if (!nominationId) return
  const triggerId = payload.trigger_id
  if (!triggerId) return
  try {
    await getSlackClient().views.open({
      trigger_id: triggerId,
      view: buildUpgradeModal({ nomination_id: nominationId, from_tier: 1 }),
    })
  } catch (err) {
    console.error('[slack] upgrade modal open failed', err)
  }
}

export async function onReviewAndDecideButton(
  payload: SlackInteractivityPayload
): Promise<void> {
  const nominationId = payload.actions?.[0]?.value
  if (!nominationId) return
  // Spec §7.1 says "review and decide" opens a full view. Phase 3 routes
  // that to the web review queue (renamed from /approvals/queue in the
  // tester-walkthrough pass), which is already richer than any modal
  // we'd build. /approvals/queue redirects to /review via next.config.
  const base = process.env.AUTH_URL ?? 'http://localhost:3000'
  const url = `${base}/review?nomination_id=${encodeURIComponent(nominationId)}`
  await respondEphemeral(payload, `Opening in the review queue: ${url}`)
}

export async function onUndoButton(
  payload: SlackInteractivityPayload
): Promise<void> {
  const nominationId = payload.actions?.[0]?.value
  if (!nominationId) return
  const slackUserId = payload.user?.id
  const actor = slackUserId ? await resolveSlackUserToEmployee(slackUserId) : null
  if (!actor) {
    await respondEphemeral(payload, "We couldn't find your record in our directory.")
    return
  }
  const result = await undoApproval({
    nomination_id: nominationId,
    actor_id: actor.id,
  })
  if (!result.ok) {
    await respondEphemeral(payload, errorTextForUndo(result.error.code))
    return
  }
  const channel = payload.container?.channel_id ?? payload.channel?.id
  const ts = payload.container?.message_ts ?? payload.message?.ts
  if (channel && ts) {
    try {
      await getSlackClient().chat.update({
        channel,
        ts,
        text: 'Undone. Waiting for your decision.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: "_Undone. The nomination is back in your queue; open it again when you're ready._",
            },
          },
        ],
      })
    } catch (err) {
      console.error('[slack] undo update failed', err)
      // Undo succeeded server-side but the DM rewrite failed. Post
      // an ephemeral so the approver knows the click registered.
      await respondEphemeral(
        payload,
        "Undone. The nomination is back in your queue. The buttons above didn't refresh — please refresh Slack to see the latest."
      )
    }
  }
}

export { ACTION_APPROVE_T1, ACTION_PROPOSE_UPGRADE_T1, ACTION_REVIEW_AND_DECIDE_T1 }
export { ACTION_UNDO_APPROVAL }

function errorTextForApprove(code: string): string {
  switch (code) {
    case 'wrong_status':
      return 'This nomination has already been acted on.'
    case 'forbidden':
      return "You aren't the approver for this nomination."
    case 'reflection_required':
      return 'This is a self-approval. Please use the web form so you can choose a reflection type.'
    default:
      return "Couldn't approve right now. Try again in a minute."
  }
}

function errorTextForUndo(code: string): string {
  switch (code) {
    case 'window_expired':
      return 'The 10-minute undo window has passed. Reach out to the People team to reverse this.'
    case 'forbidden':
      return 'Only the approver can undo.'
    case 'nothing_to_undo':
      return 'There is nothing to undo on this nomination.'
    default:
      return "Couldn't undo. Try again in a minute."
  }
}

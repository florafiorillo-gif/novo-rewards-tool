import { acknowledgeNomination, firePostIfReady } from '@/modules/communication/ack'
import { realPostSender } from '@/modules/communication/post'
import { getSlackClient } from '../client'
import { ACTION_ACKNOWLEDGE_RECOGNITION } from '../blocks/recipient-dm'
import * as copy from '../copy'
import type { SlackInteractivityPayload } from '../payloads'
import { resolveSlackUserToEmployee, respondEphemeral } from './shared'

export { ACTION_ACKNOWLEDGE_RECOGNITION }

// Recipient tapped "React to acknowledge" on their reward DM. We:
// 1. Resolve the Slack user → our Employee.
// 2. Record the ack on the Nomination.
// 3. Immediately fire the #made-it-happen post (6C wires the real sender;
//    6B ships a stub that marks the state transition but posts nothing).
// 4. Update the DM to replace the button with a confirmation line.
export async function onAcknowledgeButton(
  payload: SlackInteractivityPayload
): Promise<void> {
  const nominationId = payload.actions?.[0]?.value
  if (!nominationId) return

  const slackUserId = payload.user?.id
  const actor = slackUserId ? await resolveSlackUserToEmployee(slackUserId) : null
  if (!actor) {
    await respondEphemeral(payload, copy.actorNotFound)
    return
  }

  const result = await acknowledgeNomination(nominationId, actor.id)
  if (!result.ok) {
    await respondEphemeral(payload, errorTextForAck(result.error))
    return
  }

  // Idempotent — re-clicks (e.g. between DM refreshes) still land here
  // but acknowledgeNomination treated it as already-ack'd and firePostIfReady
  // will see post_fired_at already set.
  await firePostIfReady(nominationId, realPostSender)

  const channel = payload.container?.channel_id ?? payload.channel?.id
  const ts = payload.container?.message_ts ?? payload.message?.ts
  const client = getSlackClient()
  if (channel && ts && client) {
    try {
      await client.chat.update({
        channel,
        ts,
        text: copy.ackUpdateText,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: copy.ackUpdateMrkdwn,
            },
          },
        ],
      })
    } catch (err) {
      console.error('[slack] ack DM update failed', err)
    }
  }
}

function errorTextForAck(code: 'not_found' | 'not_recipient' | 'not_approved'): string {
  switch (code) {
    case 'not_recipient':
      return copy.ackErrorNotRecipient
    case 'not_approved':
      return copy.ackErrorNotApproved
    case 'not_found':
    default:
      return copy.ackErrorNotFound
  }
}

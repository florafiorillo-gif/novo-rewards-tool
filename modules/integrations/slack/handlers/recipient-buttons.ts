import {
  acknowledgeNomination,
  firePostIfReady,
  stubPostSender,
} from '@/modules/communication/ack'
import { getSlackClient } from '../client'
import { ACTION_ACKNOWLEDGE_RECOGNITION } from '../blocks/recipient-dm'
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
    await respondEphemeral(payload, "We couldn't find your record in our directory.")
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
  await firePostIfReady(nominationId, stubPostSender)

  const channel = payload.container?.channel_id ?? payload.channel?.id
  const ts = payload.container?.message_ts ?? payload.message?.ts
  if (channel && ts) {
    try {
      await getSlackClient().chat.update({
        channel,
        ts,
        text: 'Acknowledged — your recognition has been shared.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '_Acknowledged — your recognition has been shared._',
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
      return 'Only the recognized teammate can acknowledge this.'
    case 'not_approved':
      return 'This recognition isn\'t ready to acknowledge yet.'
    case 'not_found':
    default:
      return "We couldn't find that recognition. Try again in a minute."
  }
}

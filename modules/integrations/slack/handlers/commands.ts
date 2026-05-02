import { getSlackClient } from '../client'
import { buildNominationModal } from '../modal/nomination-modal'
import {
  ensureCanInitiateTieredNomination,
  TIERED_AUTHZ_MESSAGE,
} from '@/modules/nominations/authz'
import { resolveSlackUserToEmployee } from './shared'

// Slack sends slash commands as URL-encoded form data. We only handle /recognize
// for now; the route forwards everything else back to Slack with a generic ack.

export interface SlashCommandBody {
  command?: string
  trigger_id?: string
  user_id?: string
  user_name?: string
  team_id?: string
  channel_id?: string
}

export type SlashCommandResult =
  | { kind: 'noop' }
  | { kind: 'opened-modal' }
  // Returned when the slash command is received but the actor isn't
  // authorized to use it (e.g., non-manager running /recognize, which
  // opens the tiered nomination modal). The route handler converts this
  // into an ephemeral response so only the caller sees it.
  | { kind: 'rejected'; ephemeral_text: string }

export async function handleSlashCommand(
  body: SlashCommandBody
): Promise<SlashCommandResult> {
  if (body.command !== '/recognize') return { kind: 'noop' }
  if (!body.trigger_id) return { kind: 'noop' }

  // Real-role authz: /recognize opens the tiered modal, which is
  // manager-only. Without this gate the modal would be reachable by
  // any signed-in employee — same bug class as the missing web-action
  // server-side check.
  if (body.user_id) {
    const nominator = await resolveSlackUserToEmployee(body.user_id)
    if (nominator) {
      const authz = await ensureCanInitiateTieredNomination(nominator.id)
      if (!authz.ok) {
        return { kind: 'rejected', ephemeral_text: TIERED_AUTHZ_MESSAGE }
      }
    }
  }

  const client = getSlackClient()
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildNominationModal(),
  })
  return { kind: 'opened-modal' }
}

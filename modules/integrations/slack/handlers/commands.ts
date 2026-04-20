import { getSlackClient } from '../client'
import { buildNominationModal } from '../modal/nomination-modal'

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

export async function handleSlashCommand(body: SlashCommandBody): Promise<void> {
  if (body.command !== '/recognize') return
  if (!body.trigger_id) return

  const client = getSlackClient()
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildNominationModal(),
  })
}

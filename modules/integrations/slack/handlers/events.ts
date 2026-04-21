import { getSlackClient } from '../client'
import { getEmployeeByEmail } from '@/modules/employees/service'
import {
  findNominationByPostTs,
  recordComment,
  recordReaction,
  removeReaction,
} from '@/modules/communication/engagement'

// Slack Events API dispatcher for 6D (spec §11.2). Handles:
//   reaction_added / reaction_removed  — emoji reactions on the channel post
//   message (with thread_ts)           — thread replies as corroborating comments
//
// All paths look up the Nomination by the Slack message ts:
//   - For reactions: event.item.ts is the parent post.
//   - For thread replies: event.thread_ts is the parent post (the reply's
//     own ts is the child, which we don't store).
//
// Users are resolved via Slack user → email → Employee. If we can't resolve
// (external user, bot, legacy account), we silently drop. Bot-authored
// messages are skipped regardless — we only capture human corroboration.

interface SlackReactionEvent {
  type: 'reaction_added' | 'reaction_removed'
  user: string
  reaction: string
  item?: { type?: string; channel?: string; ts?: string }
}

interface SlackMessageEvent {
  type: 'message'
  user?: string
  text?: string
  ts?: string
  thread_ts?: string
  channel?: string
  subtype?: string
  bot_id?: string
}

export type SlackEvent = SlackReactionEvent | SlackMessageEvent | { type: string }

export async function handleSlackEvent(event: unknown): Promise<void> {
  if (!isSlackEvent(event)) return
  if (event.type === 'reaction_added' || event.type === 'reaction_removed') {
    await handleReactionEvent(event as SlackReactionEvent)
    return
  }
  if (event.type === 'message') {
    await handleMessageEvent(event as SlackMessageEvent)
    return
  }
}

async function handleReactionEvent(event: SlackReactionEvent): Promise<void> {
  const ts = event.item?.ts
  if (!ts) return
  const nomination = await findNominationByPostTs(ts)
  if (!nomination) return // reaction on some other post
  const actor = await resolveSlackUser(event.user)
  if (!actor) return
  if (event.type === 'reaction_added') {
    await recordReaction({
      nomination_id: nomination.id,
      user_id: actor.id,
      reaction_type: event.reaction,
    })
  } else {
    await removeReaction({
      nomination_id: nomination.id,
      user_id: actor.id,
      reaction_type: event.reaction,
    })
  }
}

async function handleMessageEvent(event: SlackMessageEvent): Promise<void> {
  // Skip any bot-authored or system-subtype messages — only human thread replies
  // feed the digest as corroborating comments.
  if (event.bot_id) return
  if (event.subtype && event.subtype !== 'thread_broadcast') return
  if (!event.thread_ts || event.thread_ts === event.ts) return // parent, not a reply
  if (!event.text || !event.text.trim()) return
  if (!event.user) return

  const nomination = await findNominationByPostTs(event.thread_ts)
  if (!nomination) return
  const actor = await resolveSlackUser(event.user)
  if (!actor) return

  await recordComment({
    nomination_id: nomination.id,
    user_id: actor.id,
    text: event.text,
  })
}

async function resolveSlackUser(slack_user_id: string | undefined) {
  if (!slack_user_id) return null
  try {
    const info = await getSlackClient().users.info({ user: slack_user_id })
    if (info.user?.is_bot) return null
    const email = info.user?.profile?.email
    if (!email) return null
    return await getEmployeeByEmail(email)
  } catch {
    return null
  }
}

function isSlackEvent(x: unknown): x is { type: string } {
  return typeof x === 'object' && x !== null && 'type' in (x as Record<string, unknown>)
}

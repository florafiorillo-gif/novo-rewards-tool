import { getSlackClient } from '../client'
import { getEmployeeByEmail } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import type {
  ResponseAction,
  SlackInteractivityPayload,
} from '../payloads'

// Slack sends user IDs; our domain keys on employee ID. Resolve via email.
// Returns null when Slack isn't configured or the lookup fails — every
// caller already treats null as "couldn't resolve" and skips the
// downstream gate, so the missing-token soft-disable lands here cleanly.
export async function resolveSlackUserToEmployee(
  slackUserId: string
): Promise<Employee | null> {
  const client = getSlackClient()
  if (!client) return null
  const info = await client.users.info({ user: slackUserId })
  const email = info.user?.profile?.email
  if (!email) return null
  return getEmployeeByEmail(email)
}

export function modalError(errors: Record<string, string>): ResponseAction {
  return { response_action: 'errors', errors }
}

// Posts an ephemeral message to the user via response_url. Silent on
// failure — every Slack side effect in this codebase is best-effort so
// mock-mode dev (no credentials) doesn't blow up.
export async function respondEphemeral(
  payload: SlackInteractivityPayload,
  text: string
): Promise<void> {
  const responseUrl = payload.response_url
  if (!responseUrl) return
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', text }),
    })
  } catch (err) {
    console.error('[slack] respondEphemeral failed', err)
  }
}

export function safeParseMetadata(
  raw: unknown
): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

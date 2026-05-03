import { WebClient } from '@slack/web-api'

// Singleton Slack WebClient. Returns null when SLACK_BOT_TOKEN is missing
// instead of throwing — the integration is documented to "gracefully no-op
// without config" (ONBOARDING.md, SLACK_SETUP.md), so every code path that
// touches Slack treats a missing token as a soft disable rather than an
// error. Callers receive null and short-circuit; we log one warning per
// process so the disabled state is visible in the dev/server log without
// flooding it on every call.

let _client: WebClient | null = null
let _warned = false

export function getSlackClient(): WebClient | null {
  if (_client) return _client
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    if (!_warned) {
      console.warn(
        '[slack] SLACK_BOT_TOKEN not set — Slack integration disabled. ' +
          'Outbound DMs, channel posts, and modal opens will silently no-op.'
      )
      _warned = true
    }
    return null
  }
  _client = new WebClient(token)
  return _client
}

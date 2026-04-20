import { WebClient } from '@slack/web-api'

// Singleton Slack WebClient. Throws at first call if SLACK_BOT_TOKEN is missing,
// so local dev in mock mode (without Slack credentials) only fails if someone
// actually invokes a Slack code path.

let _client: WebClient | null = null

export function getSlackClient(): WebClient {
  if (_client) return _client
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')
  _client = new WebClient(token)
  return _client
}

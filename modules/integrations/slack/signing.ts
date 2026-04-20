import crypto from 'crypto'

// Verifies a Slack-signed request. Protects against request forgery and replay.
// https://api.slack.com/authentication/verifying-requests-from-slack

const REPLAY_WINDOW_SECONDS = 60 * 5

export function verifySlackSignature(opts: {
  signingSecret: string
  timestamp: string | null
  signature: string | null
  rawBody: string
  now?: Date
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = opts
  if (!timestamp || !signature) return false

  const tsNum = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(tsNum)) return false
  const nowSec = Math.floor((opts.now?.getTime() ?? Date.now()) / 1000)
  if (Math.abs(nowSec - tsNum) > REPLAY_WINDOW_SECONDS) return false

  const [version, hash] = signature.split('=')
  if (version !== 'v0' || !hash) return false

  const base = `${version}:${timestamp}:${rawBody}`
  const expected = crypto.createHmac('sha256', signingSecret).update(base).digest('hex')
  if (expected.length !== hash.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
  } catch {
    return false
  }
}

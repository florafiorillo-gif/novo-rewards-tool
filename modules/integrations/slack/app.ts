import { App } from '@slack/bolt'
import { registerCommandHandlers } from './handlers/commands'

let _app: App | null = null

export function getSlackApp(): App {
  if (_app) return _app

  const token = process.env.SLACK_BOT_TOKEN
  const signingSecret = process.env.SLACK_SIGNING_SECRET

  if (!token || !signingSecret) {
    throw new Error('SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET must be set')
  }

  _app = new App({
    token,
    signingSecret,
    processBeforeResponse: true,
  })

  registerCommandHandlers(_app)

  return _app
}

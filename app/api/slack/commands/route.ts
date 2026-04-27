import { NextRequest, NextResponse } from 'next/server'
import { handleSlashCommand } from '@/modules/integrations/slack/handlers/commands'
import { verifySlackSignature } from '@/modules/integrations/slack/signing'

export const runtime = 'nodejs'

// Slack expects a 200 within 3 seconds. We ack immediately and let the handler
// run (openViews etc. complete in well under the window; if they don't, we'd
// push them to a background queue — not needed in Phase 2).
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    return NextResponse.json({ error: 'Slack is not configured' }, { status: 503 })
  }

  const valid = verifySlackSignature({
    signingSecret,
    timestamp: req.headers.get('x-slack-request-timestamp'),
    signature: req.headers.get('x-slack-signature'),
    rawBody,
  })
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const body = Object.fromEntries(params.entries())

  try {
    await handleSlashCommand(body)
  } catch (err) {
    console.error('[slack] slash command handler failed', err)
    return NextResponse.json(
      {
        response_type: 'ephemeral',
        text: "We couldn't open the nomination form from Slack right now. Please try again in a minute, or recognize a teammate from your dashboard on the web.",
      },
      { status: 200 }
    )
  }

  return new NextResponse(null, { status: 200 })
}

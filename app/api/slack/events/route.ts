import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/modules/integrations/slack/signing'

export const runtime = 'nodejs'

// Slack Events API endpoint. Today only handles the url_verification
// handshake. Phase 6 will add real event subscriptions (reaction_added,
// message.channels) for the #made-it-happen channel; the signing check
// below is required for that path and harmless for url_verification.
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

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  // Phase 6 will dispatch event_callback payloads through a handler here.
  // Acknowledge everything else with a 200 so Slack doesn't retry.
  return NextResponse.json({ ok: true })
}

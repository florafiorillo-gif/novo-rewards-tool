import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/modules/integrations/slack/signing'
import { handleSlackEvent } from '@/modules/integrations/slack/handlers/events'

export const runtime = 'nodejs'

// Slack Events API endpoint. Handles the url_verification handshake, then
// dispatches event_callback payloads to handleSlackEvent (reaction_added,
// reaction_removed, and thread-reply message events tied to the
// #made-it-happen post). Spec §11.2.
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

  if (body.type === 'event_callback') {
    // Slack expects a 200 within 3s; the handler is fire-and-forget
    // (it awaits internally but Slack won't retry on slow handlers since
    // we return the ack first).
    try {
      await handleSlackEvent((body as { event?: unknown }).event)
    } catch (err) {
      console.error('[slack] event dispatch failed', err)
    }
  }

  return NextResponse.json({ ok: true })
}

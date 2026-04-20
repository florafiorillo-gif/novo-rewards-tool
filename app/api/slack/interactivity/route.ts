import { NextRequest, NextResponse } from 'next/server'
import { handleInteractivity } from '@/modules/integrations/slack/handlers/interactivity'
import { verifySlackSignature } from '@/modules/integrations/slack/signing'

export const runtime = 'nodejs'

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

  // Interactivity arrives as URL-encoded `payload=<json>`.
  const params = new URLSearchParams(rawBody)
  const payloadStr = params.get('payload')
  if (!payloadStr) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(payloadStr)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  try {
    const result = await handleInteractivity(payload)
    if (result) return NextResponse.json(result)
    return new NextResponse(null, { status: 200 })
  } catch (err) {
    console.error('[slack] interactivity handler failed', err)
    return NextResponse.json(
      {
        response_action: 'errors',
        errors: {
          behavior_block: "Something went wrong — please try again in a minute.",
        },
      },
      { status: 200 }
    )
  }
}

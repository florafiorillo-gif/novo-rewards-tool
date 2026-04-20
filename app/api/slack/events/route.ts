import { NextRequest, NextResponse } from 'next/server'

// Slack sends a URL verification challenge when first configuring the Events API endpoint.
// All other events are dispatched to Bolt handlers registered in modules/integrations/slack/app.ts.
// Full Bolt integration is wired in Phase 2.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>

  const contentType = req.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      // Slash commands and interactive payloads arrive as URL-encoded form data
      const text = await req.text()
      const params = new URLSearchParams(text)
      const raw = Object.fromEntries(params.entries())
      body = raw.payload ? (JSON.parse(raw.payload) as Record<string, unknown>) : raw
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Slack URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  // Phase 2: process events through the Bolt app
  console.log('[slack] event received:', body.type)

  return NextResponse.json({ ok: true })
}

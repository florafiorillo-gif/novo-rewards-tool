import { NextRequest, NextResponse } from 'next/server'
import { runRecipientDMSweep } from '@/modules/communication/recipient-dm'

export const runtime = 'nodejs'

// Spec §9.4 + Phase 6E — fires any recipient DM whose presence window
// opened (Slack presence = active) or whose 24h fallback elapsed.
// Intended cadence is ~5 minutes; idempotent via recipient_dm_sent_at.
export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runRecipientDMSweep()
  return NextResponse.json({ ok: true, ...result })
}

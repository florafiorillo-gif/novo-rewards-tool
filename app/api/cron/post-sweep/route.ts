import { NextRequest, NextResponse } from 'next/server'
import { runPostSweep } from '@/modules/communication/ack'
import { realPostSender } from '@/modules/communication/post'

export const runtime = 'nodejs'

// Spec §9.8 — fires the #made-it-happen post for any approved nomination
// whose recipient hasn't acknowledged within 24 hours of their reward DM.
// Intended to run every ~15 minutes; idempotent (runPostSweep skips any
// nomination whose post_fired_at is already set).
export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 503 }
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await runPostSweep(realPostSender)
  return NextResponse.json({ ok: true, ...result })
}

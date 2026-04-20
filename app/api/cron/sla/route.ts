import { NextRequest, NextResponse } from 'next/server'
import { runSlaSweep } from '@/modules/approvals/sla'

export const runtime = 'nodejs'

// Scheduled by Vercel Cron (or equivalent). Authenticates the caller with a
// shared bearer secret. Spec §7.6: 72h nudge, 7d escalate, 21d auto-deny.
// Tier 3 nominations are exempted inside runSlaSweep.
export async function POST(req: NextRequest) {
  return handle(req)
}

// GET is accepted so that the same endpoint works with a wider range of
// scheduler configurations. Authorization is still required.
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

  const result = await runSlaSweep()
  return NextResponse.json({ ok: true, ...result })
}

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listManualFulfillmentQueue } from '@/modules/fulfillment/queries'
import { buildJustWorksCsv } from '@/modules/fulfillment/exports'

export const runtime = 'nodejs'

// Spec §8.1 — US cash bonuses export to a CSV that Finance uploads to
// JustWorks off-cycle. Gated to People team reps.
export async function GET(): Promise<Response> {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!(await isPeopleTeamRep(employeeId))) {
    // 404 not 403 — same logic as /committee/queue, don't leak surface.
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const all = await listManualFulfillmentQueue()
  const rows = all
    .filter(
      (i) =>
        i.reward.delivery_mechanism === 'justworks_csv' &&
        i.reward.status === 'selected' &&
        i.nominee.geo === 'US'
    )
    .map((i) => ({
      employee_id: i.nominee.id,
      name: i.nominee.name,
      email: i.nominee.email,
      net_usd: i.reward.amount_usd,
      cost_usd: i.reward.amount_usd, // tax gross-up is a display concern; cost here = spend
      nomination_id: i.reward.nomination_id,
      reward_id: i.reward.id,
    }))

  const csv = buildJustWorksCsv(rows)
  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="novo-rewards-us-cash-${today}.csv"`,
    },
  })
}

import { db } from '@/lib/db'
import { listAllMock } from '@/modules/nominations/mock-store'
import { getEmployeesByIds } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import type { Employee } from '@/modules/employees/types'
import type { NominationRecord } from '@/modules/nominations/types'
import type { ValueDef } from '@/modules/values/constants'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export interface RecognitionFeedItem {
  nomination: NominationRecord
  nominator: Employee | null
  nominee: Employee | null
  value: ValueDef | null
  /** approved_at when available; falls back to submitted_at for the rare case
   * the row is visible but has no approval timestamp (shouldn't happen in
   * normal flow, but we render defensively). */
  at: Date
}

// Composed view used by the dashboard. Shows approved / fulfilled
// recognitions the viewer is allowed to see:
//   - public: visible to everyone in the company
//   - team_only: visible to the nominee's team (same manager or same
//     manager-subtree). Phase 6 simplifies to "same manager" — good
//     enough for the in-product feed.
//   - private: visible only to the nominator, the approver, and the
//     nominee themself.
//
// Not a new domain service — strictly a view composer over existing
// readers, mirroring the pattern in manager-view / department-view.
export async function getRecognitionFeed(
  viewerId: string,
  limit = 20
): Promise<RecognitionFeedItem[]> {
  const rows: NominationRecord[] = useMock()
    ? listAllMock()
    : ((await db.nomination.findMany({
        where: { status: { in: ['approved', 'fulfilled'] } },
        orderBy: [{ approved_at: 'desc' }, { submitted_at: 'desc' }],
        take: limit * 3,
      })) as unknown as NominationRecord[])

  const visible = rows.filter(
    (n) => n.status === 'approved' || n.status === 'fulfilled'
  )

  // Enrich with employees + values up front (bulk lookup) so the per-row
  // visibility check can compare without N+1 fetches.
  const employeeIds = new Set<string>()
  for (const n of visible) {
    employeeIds.add(n.nominator_id)
    employeeIds.add(n.nominee_id)
  }
  const employees = await getEmployeesByIds([...employeeIds])

  const enriched: RecognitionFeedItem[] = visible.map((n) => ({
    nomination: n,
    nominator: employees.get(n.nominator_id) ?? null,
    nominee: employees.get(n.nominee_id) ?? null,
    value: getValueById(n.value_id),
    at: n.approved_at ?? n.submitted_at,
  }))

  const viewer = employees.get(viewerId) ?? null

  const filtered = enriched.filter((item) => {
    const nominee = item.nominee
    if (!nominee) return false
    const pref = nominee.recognition_preference

    if (pref === 'public') return true

    if (pref === 'team_only') {
      // Same manager (peer) or manager viewing their own report.
      return (
        viewer?.manager_id === nominee.manager_id ||
        viewerId === nominee.manager_id ||
        viewerId === nominee.id
      )
    }

    // private: only nominator / nominee / approver see it in the feed.
    return (
      viewerId === item.nomination.nominator_id ||
      viewerId === item.nomination.nominee_id ||
      viewerId === item.nomination.current_approver_id
    )
  })

  return filtered
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit)
}

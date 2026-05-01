import { db } from '@/lib/db'
import { useMock } from '@/modules/approvals/shared'
import { getDirectReports, getEmployeesByIds } from '@/modules/employees/service'
import { listAllMock } from '@/modules/nominations/mock-store'
import { getValueById, type ValueDef } from '@/modules/values/constants'
import type { EmployeeSummary } from '@/modules/employees/types'
import type { NominationRecord } from '@/modules/nominations/types'

// Powers /dashboard/team and the quarterly PDF export. Both surfaces show
// the same content — every approved/fulfilled recognition received by the
// signed-in manager's direct reports during the current calendar quarter,
// grouped by recipient. Q1 = Jan–Mar, …, Q4 = Oct–Dec, anchored to "now".
//
// Recipients with zero recognitions in the quarter are filtered out *here*,
// not in the consumer. Recognitions inside a group are sorted newest-first
// so 1:1 prep starts with the freshest material.

export type Quarter = 1 | 2 | 3 | 4

export interface QuarterRange {
  quarter: Quarter
  year: number
  // Inclusive start (first day of the quarter, local midnight).
  start: Date
  // Exclusive end (first day of the *next* quarter, local midnight).
  end: Date
}

export interface TeamRecognitionItem {
  id: string
  giver_name: string
  // Full ValueDef when the value resolves; null on stale ids. Consumers
  // that need the brand colour go through valueTagClasses(value.id).
  value: ValueDef | null
  // Stable text label — falls back to the raw value_id when the def is
  // missing so the PDF never prints "[null]".
  value_name: string
  // approved_at when present, else submitted_at. Same convention as the
  // existing manager-view + recognition-feed surfaces.
  date: Date
  behavior_text: string
  // Empty string when not provided. Both consumers skip the line rather
  // than printing a blank.
  outcome_text: string
  // Raw tier number; consumers derive the user-facing label via
  // tierLabel() in modules/nominations/types so every recipient-facing
  // surface stays in sync.
  current_tier: number
}

export interface TeamRecognitionGroup {
  recipient: EmployeeSummary
  // Newest first.
  recognitions: TeamRecognitionItem[]
}

export interface TeamRecognitionsForQuarter {
  manager_name: string
  quarter: Quarter
  year: number
  start: Date
  end: Date
  // Recipients with zero recognitions in the quarter are filtered out;
  // remaining groups are sorted alphabetically by recipient name.
  groups: TeamRecognitionGroup[]
}

export function quarterRangeFor(now: Date): QuarterRange {
  const month = now.getMonth()
  const quarter = (Math.floor(month / 3) + 1) as Quarter
  const year = now.getFullYear()
  const startMonth = (quarter - 1) * 3
  const start = new Date(year, startMonth, 1, 0, 0, 0, 0)
  const end = new Date(year, startMonth + 3, 1, 0, 0, 0, 0)
  return { quarter, year, start, end }
}

export async function getTeamRecognitionsForQuarter(
  managerId: string,
  now: Date = new Date()
): Promise<TeamRecognitionsForQuarter> {
  const { quarter, year, start, end } = quarterRangeFor(now)

  const [reports, managerLookup] = await Promise.all([
    getDirectReports(managerId),
    getEmployeesByIds([managerId]),
  ])
  const manager_name = managerLookup.get(managerId)?.name ?? 'Manager'

  if (reports.length === 0) {
    return { manager_name, quarter, year, start, end, groups: [] }
  }

  const reportIds = reports.map((r) => r.id)
  const inQuarter = await listRecognitionsForReportsInRange(
    reportIds,
    start,
    end
  )

  const giverIds = Array.from(new Set(inQuarter.map((n) => n.nominator_id)))
  const giverById =
    giverIds.length > 0
      ? await getEmployeesByIds(giverIds)
      : new Map<string, never>()

  const byReport = new Map<string, TeamRecognitionItem[]>()
  for (const r of reports) byReport.set(r.id, [])
  for (const n of inQuarter) {
    const list = byReport.get(n.nominee_id)
    if (!list) continue
    const value = getValueById(n.value_id)
    list.push({
      id: n.id,
      giver_name: giverById.get(n.nominator_id)?.name ?? 'Unknown',
      value,
      value_name: value?.name ?? n.value_id,
      date: n.approved_at ?? n.submitted_at,
      behavior_text: n.behavior_text,
      outcome_text: n.outcome_text ?? '',
      current_tier: n.current_tier,
    })
  }

  const groups: TeamRecognitionGroup[] = reports
    .map((recipient) => ({
      recipient,
      recognitions: (byReport.get(recipient.id) ?? []).sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      ),
    }))
    .filter((g) => g.recognitions.length > 0)
    .sort((a, b) => a.recipient.name.localeCompare(b.recipient.name))

  return { manager_name, quarter, year, start, end, groups }
}

// Approved/fulfilled recognitions where nominee_id ∈ nomineeIds and the
// effective date falls in [start, end). Same status filter the existing
// manager-view query uses; the date filter is bounded on both sides.
async function listRecognitionsForReportsInRange(
  nomineeIds: string[],
  start: Date,
  end: Date
): Promise<NominationRecord[]> {
  if (nomineeIds.length === 0) return []
  if (useMock()) {
    const ids = new Set(nomineeIds)
    return listAllMock().filter((n) => {
      if (!ids.has(n.nominee_id)) return false
      if (n.status !== 'approved' && n.status !== 'fulfilled') return false
      const at = n.approved_at ?? n.submitted_at
      return at >= start && at < end
    })
  }
  return (await db.nomination.findMany({
    where: {
      nominee_id: { in: nomineeIds },
      status: { in: ['approved', 'fulfilled'] },
      OR: [
        { approved_at: { gte: start, lt: end } },
        {
          AND: [
            { approved_at: null },
            { submitted_at: { gte: start, lt: end } },
          ],
        },
      ],
    },
  })) as unknown as NominationRecord[]
}

// Manager last-name slug for the export filename. "Flora Fiorillo" →
// "fiorillo". Falls back to "team" when the name is empty.
export function managerLastNameSlug(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'team'
  const last = parts[parts.length - 1]
  return last.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team'
}

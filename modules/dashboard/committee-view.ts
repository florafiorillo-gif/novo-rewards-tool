import { buildProgramView } from './people-team-view'
import type { PeopleTeamDashboardView } from './people-team-view'
import { isCommitteeMember } from '@/modules/roles/service'
import { listCommitteeDecisionsInRange } from '@/modules/committee/service'
import type { CommitteeDecisionRecord } from '@/modules/committee/types'
import { getEmployeesByIds } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { db } from '@/lib/db'
import type { NominationRecord } from '@/modules/nominations/types'

// Spec §10.5 — committee sees the full program dashboard plus Tier 3 pool
// detail and decisions history. The People-team assembler already exposes
// `tier3_pool`, so we reuse its output wholesale and append the decisions
// log. Gated on is_committee_member because a People-team rep who isn't on
// the committee shouldn't see per-decision log text (spec §7.5 keeps
// decision_log_text to the committee + leadership).

export interface CommitteeDecisionRow {
  decision: CommitteeDecisionRecord
  nomination: NominationRecord | null
  nominee: Employee | null
}

export interface CommitteeDashboardView extends PeopleTeamDashboardView {
  is_committee: boolean
  decisions: CommitteeDecisionRow[]
}

const EMPTY_VIEW: CommitteeDashboardView = {
  authorized: false,
  is_committee: false,
  period: null,
  in_grace: false,
  grace_ends_at: null,
  pools_by_geo: [],
  reserve: null,
  tier3_pool: null,
  exceptions: [],
  sla_misses: [],
  decisions: [],
}

export async function getCommitteeDashboardView(
  employeeId: string,
  now: Date = new Date()
): Promise<CommitteeDashboardView> {
  const is_committee = await isCommitteeMember(employeeId)
  if (!is_committee) return EMPTY_VIEW

  // Committee members get program-level visibility regardless of rep flag.
  const base = await buildProgramView(now)
  const decisions: CommitteeDecisionRow[] = base.period
    ? await loadDecisions(base.period.start_date, base.period.end_date)
    : []

  return {
    ...base,
    is_committee: true,
    decisions,
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function loadDecisions(
  start: Date,
  end: Date
): Promise<CommitteeDecisionRow[]> {
  const decisions = await listCommitteeDecisionsInRange(start, end)
  if (decisions.length === 0) return []
  const nomIds = decisions.map((d) => d.nomination_id).filter((id): id is string => !!id)
  const nominations = await loadNominationsByIds(nomIds)
  const nomineeIds = [...nominations.values()].map((n) => n.nominee_id)
  const employees = nomineeIds.length
    ? await getEmployeesByIds(nomineeIds)
    : new Map<string, Employee>()

  return decisions.map((decision) => {
    const nomination = decision.nomination_id
      ? nominations.get(decision.nomination_id) ?? null
      : null
    const nominee = nomination ? employees.get(nomination.nominee_id) ?? null : null
    return { decision, nomination, nominee }
  })
}

async function loadNominationsByIds(
  ids: string[]
): Promise<Map<string, NominationRecord>> {
  const out = new Map<string, NominationRecord>()
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) return out
  if (process.env.USE_MOCK_DATA === 'true') {
    const { listAllMock } = await import('@/modules/nominations/mock-store')
    const byId = new Map(listAllMock().map((n) => [n.id, n]))
    for (const id of unique) {
      const nom = byId.get(id)
      if (nom) out.set(id, nom)
    }
    return out
  }
  const rows = (await db.nomination.findMany({
    where: { id: { in: unique } },
  })) as unknown as NominationRecord[]
  for (const row of rows) out.set(row.id, row)
  return out
}

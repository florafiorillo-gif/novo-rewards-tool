import type { CommitteeDecisionRecord } from './types'

const store = new Map<string, CommitteeDecisionRecord>()

export function resetMockCommitteeDecisions(): void {
  store.clear()
}

export function insertMockDecision(
  record: CommitteeDecisionRecord
): CommitteeDecisionRecord {
  store.set(record.id, record)
  return record
}

export function listMockDecisionsForNomination(
  nomination_id: string
): CommitteeDecisionRecord[] {
  return [...store.values()]
    .filter((d) => d.nomination_id === nomination_id)
    .sort((a, b) => a.decided_at.getTime() - b.decided_at.getTime())
}

// Used by the committee dashboard (Phase 7D). Decisions don't carry a
// period_id column, so the caller passes the period bounds.
export function listMockDecisionsInRange(
  start: Date,
  end: Date
): CommitteeDecisionRecord[] {
  return [...store.values()]
    .filter((d) => d.decided_at >= start && d.decided_at <= end)
    .sort((a, b) => b.decided_at.getTime() - a.decided_at.getTime())
}

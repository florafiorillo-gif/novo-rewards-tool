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

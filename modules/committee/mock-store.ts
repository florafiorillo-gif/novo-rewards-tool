import type { CommitteeDecisionRecord } from './types'

// Pinned to globalThis so the Map is shared across Next.js's server-action
// and server-component webpack layers; see modules/nominations/mock-store.ts
// for the detailed rationale.
const globalForCommittee = globalThis as unknown as {
  __novo_committee_store?: Map<string, CommitteeDecisionRecord>
}
const store: Map<string, CommitteeDecisionRecord> =
  globalForCommittee.__novo_committee_store ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForCommittee.__novo_committee_store = store
}

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

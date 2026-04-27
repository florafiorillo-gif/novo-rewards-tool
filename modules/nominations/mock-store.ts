import type { NominationRecord } from './types'

// In-memory backing store used when USE_MOCK_DATA=true. Lets local dev (and the unit
// tests) exercise the nomination flow without Postgres. State resets on process restart.
//
// Pinned to globalThis so the Map survives across Next.js's server-component vs.
// server-action module layers (action-browser vs. default app layer) — otherwise
// a nomination inserted by the action handler isn't visible to the page that renders
// the confirmation, and /nominations/submitted bounces back to /nominations/new.

const globalForNominations = globalThis as unknown as {
  __novo_nomination_store?: Map<string, NominationRecord>
}
const store: Map<string, NominationRecord> =
  globalForNominations.__novo_nomination_store ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForNominations.__novo_nomination_store = store
}

export function resetMockNominations(): void {
  store.clear()
}

export function insertMock(record: NominationRecord): NominationRecord {
  store.set(record.id, record)
  return record
}

export function findByIdMock(id: string): NominationRecord | null {
  return store.get(id) ?? null
}

export function updateMock(
  id: string,
  patch: Partial<NominationRecord>
): NominationRecord | null {
  const existing = store.get(id)
  if (!existing) return null
  const updated: NominationRecord = { ...existing, ...patch, updated_at: new Date() }
  store.set(id, updated)
  return updated
}

// Returns the most recent prior nomination from the same nominator to the same nominee
// submitted at or after `since`, or null. Used for duplicate-signal detection.
export function findMostRecentPairSinceMock(
  nominator_id: string,
  nominee_id: string,
  since: Date
): NominationRecord | null {
  let best: NominationRecord | null = null
  for (const rec of store.values()) {
    if (
      rec.nominator_id === nominator_id &&
      rec.nominee_id === nominee_id &&
      rec.submitted_at >= since
    ) {
      if (!best || rec.submitted_at > best.submitted_at) best = rec
    }
  }
  return best
}

export function listByNominatorMock(nominator_id: string): NominationRecord[] {
  return [...store.values()]
    .filter((r) => r.nominator_id === nominator_id)
    .sort((a, b) => b.submitted_at.getTime() - a.submitted_at.getTime())
}

export function listPendingForApproverMock(approver_id: string): NominationRecord[] {
  return [...store.values()]
    .filter(
      (r) =>
        r.current_approver_id === approver_id &&
        (r.status === 'submitted' || r.status === 'under_review')
    )
    .sort((a, b) => a.submitted_at.getTime() - b.submitted_at.getTime())
}

// Used by approval queue queries in mock mode. Prefer the more specific
// helpers above when possible.
export function listAllMock(): NominationRecord[] {
  return [...store.values()]
}

// Group-aware reads (Round 3 group nominations). Group nominations
// share a `team_award_group_id`; siblings need to be enumerable so
// the post composer can render a single unified Slack post and the
// reward picker can offer "apply to all of yours."
export function findByGroupIdMock(group_id: string): NominationRecord[] {
  return [...store.values()]
    .filter((r) => r.team_award_group_id === group_id)
    .sort((a, b) => a.submitted_at.getTime() - b.submitted_at.getTime())
}

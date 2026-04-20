import type { NominationRecord } from './types'

// In-memory backing store used when USE_MOCK_DATA=true. Lets local dev (and the unit
// tests) exercise the nomination flow without Postgres. State resets on process restart.

const store = new Map<string, NominationRecord>()

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

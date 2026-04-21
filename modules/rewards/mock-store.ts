import type { RewardRecord } from './types'

const store = new Map<string, RewardRecord>()

export function resetMockRewards(): void {
  store.clear()
}

export function insertMockReward(record: RewardRecord): RewardRecord {
  store.set(record.id, record)
  return record
}

export function findMockRewardById(id: string): RewardRecord | null {
  return store.get(id) ?? null
}

export function findMockRewardByNominationId(
  nomination_id: string
): RewardRecord | null {
  for (const r of store.values()) {
    if (r.nomination_id === nomination_id) return r
  }
  return null
}

export function updateMockReward(
  id: string,
  patch: Partial<RewardRecord>
): RewardRecord | null {
  const existing = store.get(id)
  if (!existing) return null
  const updated = { ...existing, ...patch }
  store.set(id, updated)
  return updated
}

export function listMockRewards(): RewardRecord[] {
  return [...store.values()]
}

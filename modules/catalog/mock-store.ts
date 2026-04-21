import type { CatalogItemRecord } from './types'

const store = new Map<string, CatalogItemRecord>()

export function resetMockCatalog(): void {
  store.clear()
}

export function insertMockCatalogItem(record: CatalogItemRecord): CatalogItemRecord {
  store.set(record.id, record)
  return record
}

export function findMockCatalogItem(id: string): CatalogItemRecord | null {
  return store.get(id) ?? null
}

export function updateMockCatalogItem(
  id: string,
  patch: Partial<CatalogItemRecord>
): CatalogItemRecord | null {
  const existing = store.get(id)
  if (!existing) return null
  const updated = { ...existing, ...patch, updated_at: new Date() }
  store.set(id, updated)
  return updated
}

export function listMockCatalogItems(): CatalogItemRecord[] {
  return [...store.values()].sort((a, b) => {
    if (a.geo !== b.geo) return a.geo.localeCompare(b.geo)
    return a.amount_usd - b.amount_usd
  })
}

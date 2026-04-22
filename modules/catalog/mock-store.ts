import type { CatalogItemRecord } from './types'

// Pinned to globalThis so the Map is shared across Next.js's server-action
// and server-component webpack layers; see modules/nominations/mock-store.ts
// for the detailed rationale.
const globalForCatalog = globalThis as unknown as {
  __novo_catalog_store?: Map<string, CatalogItemRecord>
}
const store: Map<string, CatalogItemRecord> =
  globalForCatalog.__novo_catalog_store ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForCatalog.__novo_catalog_store = store
}

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

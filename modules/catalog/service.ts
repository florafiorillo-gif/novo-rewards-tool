import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import type { Geo } from '@/modules/employees/types'
import {
  findMockCatalogItem,
  insertMockCatalogItem,
  listMockCatalogItems,
  updateMockCatalogItem,
} from './mock-store'
import type {
  CatalogItemRecord,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from './types'
import { TIER_RANGES } from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listCatalogItems(args?: {
  geo?: Geo
  active_only?: boolean
}): Promise<CatalogItemRecord[]> {
  const activeOnly = args?.active_only ?? false
  if (useMock()) {
    return listMockCatalogItems().filter((item) => {
      if (args?.geo && item.geo !== args.geo) return false
      if (activeOnly && !item.active) return false
      return true
    })
  }
  const rows = await db.catalogItem.findMany({
    where: {
      ...(args?.geo ? { geo: args.geo } : {}),
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: [{ geo: 'asc' }, { amount_usd: 'asc' }],
  })
  return rows.map(hydrate)
}

export async function getCatalogItem(id: string): Promise<CatalogItemRecord | null> {
  if (useMock()) return findMockCatalogItem(id)
  const row = await db.catalogItem.findUnique({ where: { id } })
  return row ? hydrate(row) : null
}

// Filters the catalog to items eligible for a reward at a given tier/geo.
// Per spec §7.3 approver sees 5–8 options; caller may further limit.
export async function listCatalogForSelection(args: {
  geo: Geo
  tier: 1 | 2 | 3
}): Promise<CatalogItemRecord[]> {
  const range = TIER_RANGES[args.tier]
  const items = await listCatalogItems({ geo: args.geo, active_only: true })
  return items
    .filter((i) => i.amount_usd >= range.min && i.amount_usd <= range.max)
    .filter((i) => i.reward_type !== 'cash' && i.reward_type !== 'custom')
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createCatalogItem(
  input: CreateCatalogItemInput
): Promise<CatalogItemRecord> {
  const now = new Date()
  const record: CatalogItemRecord = {
    id: `cat_${randomUUID()}`,
    geo: input.geo,
    reward_type: input.reward_type,
    vendor: input.vendor ?? null,
    name: input.name,
    description: input.description,
    amount_usd: input.amount_usd,
    active: true,
    created_at: now,
    updated_at: now,
  }
  if (useMock()) {
    insertMockCatalogItem(record)
    return record
  }
  const row = await db.catalogItem.create({
    data: {
      id: record.id,
      geo: record.geo,
      reward_type: record.reward_type,
      vendor: record.vendor ?? undefined,
      name: record.name,
      description: record.description,
      amount_usd: record.amount_usd,
      active: record.active,
    },
  })
  return hydrate(row)
}

export async function updateCatalogItem(
  id: string,
  patch: UpdateCatalogItemInput
): Promise<CatalogItemRecord | null> {
  if (useMock()) return updateMockCatalogItem(id, patch)
  const row = await db.catalogItem.update({ where: { id }, data: patch })
  return hydrate(row)
}

// ─── Internal ────────────────────────────────────────────────────────────────

function hydrate(row: unknown): CatalogItemRecord {
  const r = row as {
    id: string
    geo: Geo
    reward_type: CatalogItemRecord['reward_type']
    vendor: string | null
    name: string
    description: string
    amount_usd: { toNumber(): number } | number
    active: boolean
    created_at: Date
    updated_at: Date
  }
  return {
    id: r.id,
    geo: r.geo,
    reward_type: r.reward_type,
    vendor: r.vendor,
    name: r.name,
    description: r.description,
    amount_usd: typeof r.amount_usd === 'number' ? r.amount_usd : r.amount_usd.toNumber(),
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

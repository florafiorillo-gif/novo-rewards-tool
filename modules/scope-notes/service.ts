import { randomUUID } from 'crypto'
import { db } from '@/lib/db'

export interface ScopeNoteTemplateRecord {
  id: string
  tier: number
  template_text: string
  active: boolean
}

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Pinned to globalThis so the Map is shared across Next.js's server-action
// and server-component webpack layers; see modules/nominations/mock-store.ts
// for the detailed rationale.
const globalForScopeNotes = globalThis as unknown as {
  __novo_scope_notes_store?: Map<string, ScopeNoteTemplateRecord>
}
const mockStore: Map<string, ScopeNoteTemplateRecord> =
  globalForScopeNotes.__novo_scope_notes_store ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForScopeNotes.__novo_scope_notes_store = mockStore
}

export function resetMockScopeNotes(): void {
  mockStore.clear()
}

export function insertMockScopeNote(
  record: ScopeNoteTemplateRecord
): ScopeNoteTemplateRecord {
  mockStore.set(record.id, record)
  return record
}

export async function listScopeNoteTemplates(args?: {
  tier?: 1 | 2 | 3
  active_only?: boolean
}): Promise<ScopeNoteTemplateRecord[]> {
  if (useMock()) {
    return [...mockStore.values()]
      .filter((t) => (args?.tier ? t.tier === args.tier : true))
      .filter((t) => (args?.active_only ? t.active : true))
      .sort((a, b) => a.tier - b.tier)
  }
  const rows = await db.scopeNoteTemplate.findMany({
    where: {
      ...(args?.tier ? { tier: args.tier } : {}),
      ...(args?.active_only ? { active: true } : {}),
    },
    orderBy: { tier: 'asc' },
  })
  return rows as unknown as ScopeNoteTemplateRecord[]
}

export async function createScopeNoteTemplate(input: {
  tier: 1 | 2 | 3
  template_text: string
}): Promise<ScopeNoteTemplateRecord> {
  const record: ScopeNoteTemplateRecord = {
    id: `snt_${randomUUID()}`,
    tier: input.tier,
    template_text: input.template_text,
    active: true,
  }
  if (useMock()) {
    insertMockScopeNote(record)
    return record
  }
  const row = await db.scopeNoteTemplate.create({
    data: {
      id: record.id,
      tier: record.tier,
      template_text: record.template_text,
      active: record.active,
    },
  })
  return row as unknown as ScopeNoteTemplateRecord
}

export async function setScopeNoteActive(
  id: string,
  active: boolean
): Promise<void> {
  if (useMock()) {
    const existing = mockStore.get(id)
    if (existing) mockStore.set(id, { ...existing, active })
    return
  }
  await db.scopeNoteTemplate.update({ where: { id }, data: { active } })
}

export async function getScopeNoteTemplate(
  id: string
): Promise<ScopeNoteTemplateRecord | null> {
  if (useMock()) return mockStore.get(id) ?? null
  const row = await db.scopeNoteTemplate.findUnique({ where: { id } })
  return (row as unknown as ScopeNoteTemplateRecord | null) ?? null
}

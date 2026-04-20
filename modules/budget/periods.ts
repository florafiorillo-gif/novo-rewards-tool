import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getCommitteeMembers } from '@/modules/roles/service'
import {
  findMockActivePeriod,
  findMockPeriodById,
  insertMockPeriod,
  listMockPeriods,
  updateMockPeriod,
} from './mock-store'
import type {
  AllocationConfig,
  BudgetPeriodRecord,
  CreatePeriodInput,
  PeriodResult,
} from './types'
import { DEFAULT_ALLOCATION_CONFIG } from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPeriod(
  input: CreatePeriodInput
): Promise<PeriodResult> {
  if (input.start_date.getTime() >= input.end_date.getTime()) {
    return { ok: false, error: { code: 'invalid_dates' } }
  }
  if (input.total_allocation_usd <= 0) {
    return { ok: false, error: { code: 'invalid_amount' } }
  }

  const record: BudgetPeriodRecord = {
    id: `bp_${randomUUID()}`,
    period_label: input.period_label,
    start_date: input.start_date,
    end_date: input.end_date,
    total_allocation_usd: input.total_allocation_usd,
    status: 'draft',
    approved_by: [],
    approved_at: null,
    allocation_config: input.allocation_config ?? DEFAULT_ALLOCATION_CONFIG,
    closed_at: null,
  }

  if (useMock()) {
    insertMockPeriod(record)
    return { ok: true, period: record }
  }

  const row = await db.budgetPeriod.create({
    data: {
      id: record.id,
      period_label: record.period_label,
      start_date: record.start_date,
      end_date: record.end_date,
      total_allocation_usd: record.total_allocation_usd,
      status: 'draft',
      approved_by: [],
      allocation_config: (record.allocation_config ?? null) as unknown as object,
    },
  })
  return { ok: true, period: { ...record, id: row.id } }
}

// ─── Approve ─────────────────────────────────────────────────────────────────
// Spec §10.1 — committee (Flora and Rares) sign off. To match the Tier 2
// two-approver pattern, the period stays draft until every active
// is_committee_member=true employee has approved. Then status flips to
// `approved`; when start_date passes, a separate `activatePeriod` call
// (or the cron in Phase 9) flips it to `active`.

export async function approvePeriod(
  period_id: string,
  actor_id: string
): Promise<PeriodResult> {
  const period = await loadPeriod(period_id)
  if (!period) return { ok: false, error: { code: 'not_found' } }
  if (period.status !== 'draft') {
    return { ok: false, error: { code: 'wrong_status', status: period.status } }
  }

  const committee = await getCommitteeMembers()
  if (!committee.some((c) => c.id === actor_id)) {
    return { ok: false, error: { code: 'forbidden' } }
  }

  const approvedBy = Array.from(new Set([...period.approved_by, actor_id]))
  const allApproved = committee.every((c) => approvedBy.includes(c.id))

  const patch: Partial<BudgetPeriodRecord> = {
    approved_by: approvedBy,
    ...(allApproved
      ? { status: 'approved' as const, approved_at: new Date() }
      : {}),
  }

  const updated = await patchPeriod(period_id, patch)
  return { ok: true, period: updated }
}

// ─── Activate / close ────────────────────────────────────────────────────────

export async function activatePeriod(period_id: string): Promise<PeriodResult> {
  const period = await loadPeriod(period_id)
  if (!period) return { ok: false, error: { code: 'not_found' } }
  if (period.status !== 'approved') {
    return { ok: false, error: { code: 'wrong_status', status: period.status } }
  }
  const updated = await patchPeriod(period_id, { status: 'active' })
  return { ok: true, period: updated }
}

export async function closePeriod(
  period_id: string,
  actor_id: string,
  now: Date = new Date()
): Promise<PeriodResult> {
  const period = await loadPeriod(period_id)
  if (!period) return { ok: false, error: { code: 'not_found' } }
  if (period.status !== 'active' && period.status !== 'approved') {
    return { ok: false, error: { code: 'wrong_status', status: period.status } }
  }

  const committee = await getCommitteeMembers()
  if (!committee.some((c) => c.id === actor_id)) {
    return { ok: false, error: { code: 'forbidden' } }
  }

  // Spec §10.4 + Phase 4 decision — set status + closed_at now. Pools stay
  // drawable for 14 days so in-flight approvals can still select rewards.
  // Phase 5 reward-selection enforces the lapse check against CLOSE_GRACE_MS.
  const updated = await patchPeriod(period_id, {
    status: 'closed',
    closed_at: now,
  })
  return { ok: true, period: updated }
}

// ─── Read helpers ────────────────────────────────────────────────────────────

export async function getActivePeriod(
  now: Date = new Date()
): Promise<BudgetPeriodRecord | null> {
  if (useMock()) return findMockActivePeriod(now)
  const row = await db.budgetPeriod.findFirst({
    where: {
      status: 'active',
      start_date: { lte: now },
      end_date: { gte: now },
    },
    orderBy: { start_date: 'desc' },
  })
  return row ? hydratePeriodRow(row) : null
}

export async function getPeriod(period_id: string): Promise<BudgetPeriodRecord | null> {
  return loadPeriod(period_id)
}

export async function listPeriods(): Promise<BudgetPeriodRecord[]> {
  if (useMock()) return listMockPeriods()
  const rows = await db.budgetPeriod.findMany({ orderBy: { start_date: 'desc' } })
  return rows.map(hydratePeriodRow)
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function loadPeriod(id: string): Promise<BudgetPeriodRecord | null> {
  if (useMock()) return findMockPeriodById(id)
  const row = await db.budgetPeriod.findUnique({ where: { id } })
  return row ? hydratePeriodRow(row) : null
}

async function patchPeriod(
  id: string,
  patch: Partial<BudgetPeriodRecord>
): Promise<BudgetPeriodRecord> {
  if (useMock()) {
    const updated = updateMockPeriod(id, patch)
    if (!updated) throw new Error(`patchPeriod: ${id} not found`)
    return updated
  }
  const data: Record<string, unknown> = { ...patch }
  if ('allocation_config' in data) {
    data.allocation_config = (patch.allocation_config ?? null) as unknown as object
  }
  const row = await db.budgetPeriod.update({ where: { id }, data })
  return hydratePeriodRow(row)
}

function hydratePeriodRow(row: unknown): BudgetPeriodRecord {
  const r = row as {
    id: string
    period_label: string
    start_date: Date
    end_date: Date
    total_allocation_usd: { toNumber(): number } | number
    status: BudgetPeriodRecord['status']
    approved_by: string[]
    approved_at: Date | null
    allocation_config: unknown
    closed_at: Date | null
  }
  return {
    id: r.id,
    period_label: r.period_label,
    start_date: r.start_date,
    end_date: r.end_date,
    total_allocation_usd:
      typeof r.total_allocation_usd === 'number'
        ? r.total_allocation_usd
        : r.total_allocation_usd.toNumber(),
    status: r.status,
    approved_by: r.approved_by,
    approved_at: r.approved_at,
    allocation_config: (r.allocation_config as AllocationConfig | null) ?? null,
    closed_at: r.closed_at,
  }
}

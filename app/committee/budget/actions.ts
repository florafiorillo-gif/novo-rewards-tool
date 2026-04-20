'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  activatePeriod,
  approvePeriod,
  closePeriod,
  createPeriod,
} from '@/modules/budget/periods'
import { allocatePools } from '@/modules/budget/allocation'
import { isCommitteeMember } from '@/modules/roles/service'
import {
  DEFAULT_ALLOCATION_CONFIG,
  type AllocationConfig,
} from '@/modules/budget/types'

async function requireCommitteeActor(): Promise<string> {
  const session = await auth()
  const id = session?.user?.employeeId
  if (!id) throw new Error('Not authenticated')
  if (!(await isCommitteeMember(id))) throw new Error('Not authorized')
  return id
}

function parseAllocationConfig(formData: FormData): AllocationConfig {
  // Each field has a fallback to the v1 default so the form can submit a
  // partial config and end up with a sensible whole. Validation runs in
  // allocatePools; invalid percentages surface back as an error state.
  const n = (key: string, fallback: number): number => {
    const raw = formData.get(key)
    if (typeof raw !== 'string' || raw.length === 0) return fallback
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const d = DEFAULT_ALLOCATION_CONFIG
  return {
    tier3_pct: n('tier3_pct', d.tier3_pct),
    reserve_pct: n('reserve_pct', d.reserve_pct),
    within_geo: {
      manager_tier1_pct: n('manager_tier1_pct', d.within_geo.manager_tier1_pct),
      peer_tier1_pct: n('peer_tier1_pct', d.within_geo.peer_tier1_pct),
      dept_tier2_pct: n('dept_tier2_pct', d.within_geo.dept_tier2_pct),
    },
  }
}

// ─── Create period ───────────────────────────────────────────────────────────

export async function createPeriodAction(formData: FormData): Promise<void> {
  await requireCommitteeActor()
  const label = (formData.get('period_label') ?? '').toString().trim()
  const startStr = (formData.get('start_date') ?? '').toString()
  const endStr = (formData.get('end_date') ?? '').toString()
  const totalStr = (formData.get('total_allocation_usd') ?? '').toString()

  const total = Number.parseFloat(totalStr)
  if (!label || !startStr || !endStr || !Number.isFinite(total) || total <= 0) {
    return
  }

  const config = parseAllocationConfig(formData)
  const result = await createPeriod({
    period_label: label,
    start_date: new Date(startStr),
    end_date: new Date(endStr),
    total_allocation_usd: total,
    allocation_config: config,
  })
  if (!result.ok) {
    revalidatePath('/committee/budget')
    return
  }
  redirect(`/committee/budget/${result.period.id}`)
}

// ─── Allocate pools ──────────────────────────────────────────────────────────

export async function allocatePoolsAction(formData: FormData): Promise<void> {
  await requireCommitteeActor()
  const periodId = (formData.get('period_id') ?? '').toString()
  if (!periodId) return
  const config = parseAllocationConfig(formData)
  await allocatePools(periodId, config)
  revalidatePath(`/committee/budget/${periodId}`)
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export async function approvePeriodAction(formData: FormData): Promise<void> {
  const actorId = await requireCommitteeActor()
  const periodId = (formData.get('period_id') ?? '').toString()
  if (!periodId) return
  await approvePeriod(periodId, actorId)
  revalidatePath(`/committee/budget/${periodId}`)
}

// ─── Activate ────────────────────────────────────────────────────────────────

export async function activatePeriodAction(formData: FormData): Promise<void> {
  await requireCommitteeActor()
  const periodId = (formData.get('period_id') ?? '').toString()
  if (!periodId) return
  await activatePeriod(periodId)
  revalidatePath(`/committee/budget/${periodId}`)
}

// ─── Close ───────────────────────────────────────────────────────────────────

export async function closePeriodAction(formData: FormData): Promise<void> {
  const actorId = await requireCommitteeActor()
  const periodId = (formData.get('period_id') ?? '').toString()
  if (!periodId) return
  await closePeriod(periodId, actorId)
  revalidatePath(`/committee/budget/${periodId}`)
}

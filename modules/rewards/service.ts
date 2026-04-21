import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getEmployeeById } from '@/modules/employees/service'
import { getCatalogItem } from '@/modules/catalog/service'
import { TIER_RANGES } from '@/modules/catalog/types'
import { getActivePeriod } from '@/modules/budget/periods'
import { commitSpend } from '@/modules/budget/pools'
import { drawFromReserve } from '@/modules/budget/exceptions'
import { resolvePoolForNomination } from '@/modules/budget/routing'
import { CLOSE_GRACE_MS } from '@/modules/budget/types'
import { loadNomination } from '@/modules/approvals/shared'
import { resolveDeliveryMechanism } from '@/modules/fulfillment/routing'
import {
  findMockRewardById,
  findMockRewardByNominationId,
  insertMockReward,
  listMockRewards,
  updateMockReward,
} from './mock-store'
import type {
  ConfirmRewardInput,
  ConfirmRewardResult,
  FulfillmentResult,
  IssueRewardInput,
  MarkRewardDeliveredInput,
  MarkRewardFailedInput,
  RewardRecord,
  SelectRewardInput,
  SelectRewardResult,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getReward(id: string): Promise<RewardRecord | null> {
  if (useMock()) return findMockRewardById(id)
  const row = await db.reward.findUnique({ where: { id } })
  return row ? hydrate(row) : null
}

export async function getRewardForNomination(
  nomination_id: string
): Promise<RewardRecord | null> {
  if (useMock()) return findMockRewardByNominationId(nomination_id)
  const row = await db.reward.findUnique({ where: { nomination_id } })
  return row ? hydrate(row) : null
}

export async function listRewards(): Promise<RewardRecord[]> {
  if (useMock()) return listMockRewards()
  const rows = await db.reward.findMany()
  return rows.map(hydrate)
}

// ─── Select (Phase 5 core) ───────────────────────────────────────────────────

export async function selectReward(
  input: SelectRewardInput
): Promise<SelectRewardResult> {
  if (!input.scope_note_text.trim()) {
    return { ok: false, error: { code: 'scope_note_required' } }
  }
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'nomination_not_found' } }
  if (nom.status !== 'approved') {
    return { ok: false, error: { code: 'nomination_wrong_status' } }
  }

  const existing = await getRewardForNomination(nom.id)
  if (existing) return { ok: false, error: { code: 'reward_already_selected' } }

  // Lapse check (pre-Phase-5 TODO): if the period active at approval
  // time is now closed AND the 14-day grace has elapsed, refuse.
  const period = await getActivePeriod()
  if (!period) {
    // Closed or no period — check if a closed period within grace still covers this.
    const lapseError = await evaluateLapse(nom.approved_at)
    if (lapseError) return { ok: false, error: lapseError }
    return { ok: false, error: { code: 'no_active_period' } }
  }

  const nominee = await getEmployeeById(nom.nominee_id)
  if (!nominee) return { ok: false, error: { code: 'nomination_not_found' } }

  // Resolve the target pool + amount.
  const resolution = await resolveRewardAmount(input, nominee.geo, nom.current_tier as 1 | 2 | 3)
  if (!resolution.ok) return { ok: false, error: resolution.error }
  const { amount_usd, reward_type, vendor, catalog_item_id: _catId } = resolution

  // Budget commit — primary pool unless the approver flagged exception.
  if (input.budget_exception) {
    const draw = await drawFromReserve({
      period_id: period.id,
      nomination_id: nom.id,
      amount_usd,
      approver_id: input.actor_id,
      reason_text: 'Primary pool exhausted; approver marked exception.',
    })
    if (!draw.ok) {
      if (draw.error.code === 'insufficient_balance') {
        return { ok: false, error: { code: 'insufficient_balance', remaining: draw.error.remaining } }
      }
      return { ok: false, error: { code: 'no_active_period' } }
    }
  } else {
    const poolResolution = await resolvePoolForNomination({
      nomination_id: nom.id,
      current_tier: nom.current_tier as 1 | 2 | 3,
      nominator_id: nom.nominator_id,
      nominee_id: nom.nominee_id,
      nominee_manager_id: nominee.manager_id,
      nominee_geo: nominee.geo,
      nominee_department: nominee.department,
    })
    if (!poolResolution.ok) {
      return { ok: false, error: { code: 'no_active_period' } }
    }
    const spend = await commitSpend({
      pool_id: poolResolution.pool.id,
      amount_usd,
      nomination_id: nom.id,
      approver_id: input.actor_id,
    })
    if (!spend.ok) {
      if (spend.error.code === 'insufficient_balance') {
        return { ok: false, error: { code: 'insufficient_balance', remaining: spend.error.remaining } }
      }
      return { ok: false, error: { code: 'no_active_period' } }
    }
  }

  // Write the Reward row.
  const delivery_mechanism = resolveDeliveryMechanism({
    geo: nominee.geo,
    reward_type,
    employment_type: nominee.employment_type,
  })
  const now = new Date()
  const record: RewardRecord = {
    id: `rew_${randomUUID()}`,
    nomination_id: nom.id,
    reward_type,
    vendor,
    amount_usd,
    amount_local: null,
    currency_local: null,
    status: input.pending_confirm ? 'selected_pending_confirm' : 'selected',
    delivery_mechanism,
    scope_note_template_id: input.scope_note_template_id,
    scope_note_text: input.scope_note_text.trim(),
    issued_at: null,
    delivered_at: null,
    recipient_dm_scheduled_at: null,
    recipient_dm_sent_at: null,
    budget_exception: input.budget_exception,
    created_at: now,
  }

  if (useMock()) {
    insertMockReward(record)
    return { ok: true, reward: record }
  }
  const row = await db.reward.create({
    data: {
      id: record.id,
      nomination_id: record.nomination_id,
      reward_type: record.reward_type,
      vendor: record.vendor ?? undefined,
      amount_usd: record.amount_usd,
      status: record.status,
      delivery_mechanism: record.delivery_mechanism,
      scope_note_template_id: record.scope_note_template_id ?? undefined,
      scope_note_text: record.scope_note_text ?? undefined,
    },
  })
  return { ok: true, reward: hydrate(row) }
}

async function evaluateLapse(
  approved_at: Date | null
): Promise<{ code: 'period_lapsed' } | null> {
  if (!approved_at) return null
  // Find the period that was active when this nomination was approved.
  const periods = useMock()
    ? (await import('@/modules/budget/mock-store')).listMockPeriods()
    : ((await db.budgetPeriod.findMany()) as unknown as Array<{
        start_date: Date
        end_date: Date
        closed_at: Date | null
      }>)
  const containing = periods.find(
    (p) =>
      p.start_date.getTime() <= approved_at.getTime() &&
      p.end_date.getTime() >= approved_at.getTime()
  )
  if (!containing?.closed_at) return null
  const graceEnds = containing.closed_at.getTime() + CLOSE_GRACE_MS
  if (Date.now() > graceEnds) return { code: 'period_lapsed' }
  return null
}

// Resolves the reward's amount + type + vendor from either the catalog
// item, a custom override, or the cash option (which uses custom.amount).
async function resolveRewardAmount(
  input: SelectRewardInput,
  nominee_geo: string,
  tier: 1 | 2 | 3
): Promise<
  | {
      ok: true
      amount_usd: number
      reward_type: RewardRecord['reward_type']
      vendor: string | null
      catalog_item_id: string | null
    }
  | { ok: false; error: SelectRewardInput extends never ? never : import('./types').SelectRewardError }
> {
  const range = TIER_RANGES[tier]

  if (input.catalog_item_id) {
    const item = await getCatalogItem(input.catalog_item_id)
    if (!item) return { ok: false, error: { code: 'catalog_item_not_found' } }
    if (item.geo !== nominee_geo) return { ok: false, error: { code: 'catalog_geo_mismatch' } }
    if (item.amount_usd < range.min || item.amount_usd > range.max) {
      return {
        ok: false,
        error: { code: 'amount_out_of_range', min: range.min, max: range.max },
      }
    }
    return {
      ok: true,
      amount_usd: item.amount_usd,
      reward_type: item.reward_type,
      vendor: item.vendor,
      catalog_item_id: item.id,
    }
  }

  if (!input.custom) return { ok: false, error: { code: 'invalid_amount' } }
  if (input.custom.amount_usd <= 0) return { ok: false, error: { code: 'invalid_amount' } }
  if (input.custom.amount_usd < range.min || input.custom.amount_usd > range.max) {
    return {
      ok: false,
      error: { code: 'amount_out_of_range', min: range.min, max: range.max },
    }
  }
  return {
    ok: true,
    amount_usd: input.custom.amount_usd,
    reward_type: input.custom.reward_type,
    vendor: null,
    catalog_item_id: null,
  }
}

// ─── Confirm (Tier 2 People team rep sign-off) ───────────────────────────────

export async function confirmReward(
  input: ConfirmRewardInput
): Promise<ConfirmRewardResult> {
  const reward = await getReward(input.reward_id)
  if (!reward) return { ok: false, error: { code: 'not_found' } }
  if (reward.status !== 'selected_pending_confirm') {
    return { ok: false, error: { code: 'wrong_status' } }
  }

  const nom = await loadNomination(reward.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  // Only the snapshot People team rep (not the dept head who picked) can
  // confirm — spec §7.4 "People team rep signs off on the reward choice."
  if (nom.tier2_people_team_rep_id !== input.actor_id) {
    return { ok: false, error: { code: 'forbidden' } }
  }

  // Budget commit happens at confirm, not at select (pending_confirm is
  // literally a no-commit staging state).
  const nominee = await getEmployeeById(nom.nominee_id)
  if (!nominee) return { ok: false, error: { code: 'not_found' } }
  const period = await getActivePeriod()
  if (!period) return { ok: false, error: { code: 'no_active_period' } }

  if (reward.budget_exception) {
    const draw = await drawFromReserve({
      period_id: period.id,
      nomination_id: nom.id,
      amount_usd: reward.amount_usd,
      approver_id: input.actor_id,
      reason_text: 'Tier 2 reward confirmed with budget exception flag.',
    })
    if (!draw.ok && draw.error.code === 'insufficient_balance') {
      return {
        ok: false,
        error: { code: 'insufficient_balance', remaining: draw.error.remaining },
      }
    }
  } else {
    const poolResolution = await resolvePoolForNomination({
      nomination_id: nom.id,
      current_tier: 2,
      nominator_id: nom.nominator_id,
      nominee_id: nom.nominee_id,
      nominee_manager_id: nominee.manager_id,
      nominee_geo: nominee.geo,
      nominee_department: nominee.department,
    })
    if (!poolResolution.ok) return { ok: false, error: { code: 'no_active_period' } }
    const spend = await commitSpend({
      pool_id: poolResolution.pool.id,
      amount_usd: reward.amount_usd,
      nomination_id: nom.id,
      approver_id: input.actor_id,
    })
    if (!spend.ok && spend.error.code === 'insufficient_balance') {
      return {
        ok: false,
        error: { code: 'insufficient_balance', remaining: spend.error.remaining },
      }
    }
  }

  const updated = await patchReward(reward.id, { status: 'selected' })
  return { ok: true, reward: updated }
}

// ─── Fulfillment transitions ────────────────────────────────────────────────

export async function markRewardIssued(
  input: IssueRewardInput
): Promise<FulfillmentResult> {
  const reward = await getReward(input.reward_id)
  if (!reward) return { ok: false, error: { code: 'not_found' } }
  if (reward.status !== 'selected') return { ok: false, error: { code: 'wrong_status' } }
  const updated = await patchReward(reward.id, {
    status: 'issued',
    issued_at: new Date(),
    vendor:
      reward.vendor ??
      (input.vendor_reference_id ? null : null), // reference id tracked separately if we add a column
  })
  return { ok: true, reward: updated }
}

export async function markRewardDelivered(
  input: MarkRewardDeliveredInput
): Promise<FulfillmentResult> {
  const reward = await getReward(input.reward_id)
  if (!reward) return { ok: false, error: { code: 'not_found' } }
  if (reward.status !== 'issued') return { ok: false, error: { code: 'wrong_status' } }
  const now = input.now ?? new Date()
  const updated = await patchReward(reward.id, {
    status: 'delivered',
    delivered_at: now,
  })
  // Flip the nomination to fulfilled per Q6 mapping.
  if (useMock()) {
    const { updateMock } = await import('@/modules/nominations/mock-store')
    updateMock(reward.nomination_id, { status: 'fulfilled' })
  } else {
    await db.nomination.update({
      where: { id: reward.nomination_id },
      data: { status: 'fulfilled' },
    })
  }
  return { ok: true, reward: updated }
}

export async function markRewardFailed(
  input: MarkRewardFailedInput
): Promise<FulfillmentResult> {
  const reward = await getReward(input.reward_id)
  if (!reward) return { ok: false, error: { code: 'not_found' } }
  // Allow failing from issued or selected (manual path never got to issued).
  if (reward.status !== 'issued' && reward.status !== 'selected') {
    return { ok: false, error: { code: 'wrong_status' } }
  }
  const updated = await patchReward(reward.id, { status: 'failed' })
  return { ok: true, reward: updated }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function patchReward(
  id: string,
  patch: Partial<RewardRecord>
): Promise<RewardRecord> {
  if (useMock()) {
    const updated = updateMockReward(id, patch)
    if (!updated) throw new Error(`patchReward: ${id} not found`)
    return updated
  }
  const { id: _omit, created_at: _omit2, ...writable } = patch
  const row = await db.reward.update({ where: { id }, data: writable as never })
  return hydrate(row)
}

function hydrate(row: unknown): RewardRecord {
  const r = row as {
    id: string
    nomination_id: string
    reward_type: RewardRecord['reward_type']
    vendor: string | null
    amount_usd: { toNumber(): number } | number
    amount_local: { toNumber(): number } | number | null
    currency_local: string | null
    status: RewardRecord['status']
    delivery_mechanism: RewardRecord['delivery_mechanism']
    scope_note_template_id: string | null
    scope_note_text: string | null
    issued_at: Date | null
    delivered_at: Date | null
    recipient_dm_scheduled_at: Date | null
    recipient_dm_sent_at: Date | null
    created_at?: Date
  }
  return {
    id: r.id,
    nomination_id: r.nomination_id,
    reward_type: r.reward_type,
    vendor: r.vendor,
    amount_usd: typeof r.amount_usd === 'number' ? r.amount_usd : r.amount_usd.toNumber(),
    amount_local:
      r.amount_local == null
        ? null
        : typeof r.amount_local === 'number'
        ? r.amount_local
        : r.amount_local.toNumber(),
    currency_local: r.currency_local,
    status: r.status,
    delivery_mechanism: r.delivery_mechanism,
    scope_note_template_id: r.scope_note_template_id,
    scope_note_text: r.scope_note_text,
    issued_at: r.issued_at,
    delivered_at: r.delivered_at,
    recipient_dm_scheduled_at: r.recipient_dm_scheduled_at,
    recipient_dm_sent_at: r.recipient_dm_sent_at,
    // Prisma schema doesn't (yet) have a budget_exception column; reconstruct
    // via join against BudgetException at read sites that need it. For Phase
    // 5 the mock store tracks the flag; DB path defaults to false.
    budget_exception: false,
    created_at: r.created_at ?? new Date(),
  }
}

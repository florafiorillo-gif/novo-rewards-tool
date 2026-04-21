import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  findByIdMock as findNominationByIdMock,
  listAllMock as listAllNominationsMock,
  updateMock as updateNominationMock,
} from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import { getEmployeesByIds } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import {
  hasTier3ConflictFromMap,
  isCommitteeMember,
} from '@/modules/roles/service'
import {
  listApprovalActions,
  listApprovalActionsForNominations,
  recordAction,
} from '@/modules/approvals/service'
import type { ApprovalActionRecord } from '@/modules/approvals/types'
import {
  insertMockDecision,
  listMockDecisionsForNomination,
} from './mock-store'
import type {
  CommitteeDecideInput,
  CommitteeDecideResult,
  CommitteeDecisionRecord,
  RecuseInput,
  RecuseResult,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// ─── Decide (approve / deny / defer) ─────────────────────────────────────────

import { TIER_RANGES } from '@/modules/catalog/types'
import { getActivePeriod } from '@/modules/budget/periods'
import { commitSpend } from '@/modules/budget/pools'
import { resolvePoolForNomination } from '@/modules/budget/routing'
import { resolveDeliveryMechanism } from '@/modules/fulfillment/routing'
import { insertMockReward } from '@/modules/rewards/mock-store'
import type { RewardRecord } from '@/modules/rewards/types'

export async function decideCommittee(
  input: CommitteeDecideInput
): Promise<CommitteeDecideResult> {
  if (!input.decision_log_text?.trim()) {
    return { ok: false, error: { code: 'decision_log_required' } }
  }

  const nom = useMock()
    ? findNominationByIdMock(input.nomination_id)
    : ((await db.nomination.findUnique({
        where: { id: input.nomination_id },
      })) as unknown as NominationRecord | null)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.current_tier !== 3 || nom.status !== 'under_review') {
    return { ok: false, error: { code: 'wrong_status' } }
  }

  const authorized = await isCommitteeMember(input.actor_id)
  if (!authorized) return { ok: false, error: { code: 'forbidden' } }

  const actions = await listApprovalActions(nom.id)
  const recused = actions.some(
    (a) => a.action === 'recuse' && a.actor_id === input.actor_id
  )
  if (recused) return { ok: false, error: { code: 'recused' } }

  // Approve requires a complete reward payload (spec §7.5).
  const tier3Range = TIER_RANGES[3]
  if (input.decision === 'approve') {
    if (!input.reward) {
      return { ok: false, error: { code: 'reward_required_on_approve' } }
    }
    if (
      input.reward.amount_usd < tier3Range.min ||
      input.reward.amount_usd > tier3Range.max
    ) {
      return {
        ok: false,
        error: {
          code: 'reward_amount_out_of_range',
          min: tier3Range.min,
          max: tier3Range.max,
        },
      }
    }
    if (!input.reward.delivery_plan?.trim()) {
      return { ok: false, error: { code: 'delivery_plan_required' } }
    }
    if (!input.reward.scope_note_text?.trim()) {
      return { ok: false, error: { code: 'delivery_plan_required' } }
    }
  }

  const now = new Date()
  const members = input.concurring_member_ids?.length
    ? Array.from(new Set([input.actor_id, ...input.concurring_member_ids]))
    : [input.actor_id]

  const conflictedMembers = actions
    .filter((a) => a.action === 'recuse')
    .map((a) => a.actor_id)

  // For approve, commit the Tier 3 budget BEFORE writing the decision so
  // we never have a CommitteeDecision referring to a spend that failed.
  if (input.decision === 'approve' && input.reward) {
    const period = await getActivePeriod()
    if (!period) return { ok: false, error: { code: 'no_active_period' } }
    const resolution = await resolvePoolForNomination({
      nomination_id: nom.id,
      current_tier: 3,
      nominator_id: nom.nominator_id,
      nominee_id: nom.nominee_id,
      nominee_manager_id: null,
      nominee_geo: 'US', // committee pool is not geo-filtered; any valid geo works
      nominee_department: null,
    })
    if (!resolution.ok) return { ok: false, error: { code: 'no_active_period' } }
    const spend = await commitSpend({
      pool_id: resolution.pool.id,
      amount_usd: input.reward.amount_usd,
      nomination_id: nom.id,
      approver_id: input.actor_id,
    })
    if (!spend.ok) {
      if (spend.error.code === 'insufficient_balance') {
        return {
          ok: false,
          error: { code: 'insufficient_balance', remaining: spend.error.remaining },
        }
      }
      return { ok: false, error: { code: 'no_active_period' } }
    }
  }

  const decisionRecord: CommitteeDecisionRecord = {
    id: `cdec_${randomUUID()}`,
    nomination_id: nom.id,
    team_award_group_id: null,
    committee_members: members,
    decision: input.decision,
    approved_amount_usd:
      input.decision === 'approve' ? input.reward!.amount_usd : null,
    reward_form: input.decision === 'approve' ? input.reward!.reward_type : null,
    delivery_plan:
      input.decision === 'approve' ? input.reward!.delivery_plan : null,
    decision_log_text: input.decision_log_text,
    conflicted_members: conflictedMembers,
    substitute_member_id: null,
    delivered_by_id: null,
    delivered_at: null,
    decided_at: now,
  }

  if (useMock()) {
    insertMockDecision(decisionRecord)
  } else {
    const created = await db.committeeDecision.create({
      data: {
        nomination_id: nom.id,
        committee_members: members,
        decision: input.decision,
        decision_log_text: input.decision_log_text,
        conflicted_members: conflictedMembers,
        approved_amount_usd: decisionRecord.approved_amount_usd ?? undefined,
        reward_form: decisionRecord.reward_form ?? undefined,
        delivery_plan: decisionRecord.delivery_plan ?? undefined,
      },
    })
    decisionRecord.id = created.id
  }

  // Mirror the decision into the ApprovalAction audit trail.
  const auditAction =
    input.decision === 'approve'
      ? 'approve'
      : input.decision === 'deny'
      ? 'deny'
      : 'request_info' // defer is effectively "ask again later"; reuse existing enum
  await recordAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: auditAction,
    from_tier: 3,
    to_tier: input.decision === 'deny' ? 2 : undefined,
    reason_structured: input.decision === 'deny' ? 'other' : undefined,
    reason_text: input.decision_log_text,
  })

  // Nomination state transition.
  if (input.decision === 'approve' && input.reward) {
    // Write the Reward row — stays in `selected` since Tier 3 delivery is
    // manual (Rares/Flora personally delivers per spec §7.5).
    const nominee = await getNomineeForNomination(nom.nominee_id)
    const reward: RewardRecord = {
      id: `rew_${randomUUID()}`,
      nomination_id: nom.id,
      reward_type: input.reward.reward_type,
      vendor: null,
      amount_usd: input.reward.amount_usd,
      amount_local: null,
      currency_local: null,
      status: 'selected',
      delivery_mechanism: resolveDeliveryMechanism({
        geo: nominee?.geo ?? 'US',
        reward_type: input.reward.reward_type,
        employment_type: nominee?.employment_type,
      }),
      scope_note_template_id: input.reward.scope_note_template_id ?? null,
      scope_note_text: input.reward.scope_note_text,
      issued_at: null,
      delivered_at: null,
      budget_exception: false,
      created_at: now,
    }
    if (useMock()) {
      insertMockReward(reward)
    } else {
      await db.reward.create({
        data: {
          id: reward.id,
          nomination_id: reward.nomination_id,
          reward_type: reward.reward_type,
          amount_usd: reward.amount_usd,
          status: reward.status,
          delivery_mechanism: reward.delivery_mechanism,
          scope_note_template_id: reward.scope_note_template_id ?? undefined,
          scope_note_text: reward.scope_note_text ?? undefined,
        },
      })
    }

    await patchNomination(nom.id, {
      status: 'approved',
      approved_at: now,
      current_approver_id: null,
    })
    return { ok: true, decision: decisionRecord, outcome: 'approved' }
  }
  if (input.decision === 'deny') {
    await patchNomination(nom.id, {
      current_tier: 2,
      status: 'under_review',
      urgent: false,
    })
    return { ok: true, decision: decisionRecord, outcome: 'returned_to_tier_2' }
  }
  // defer — stays under_review.
  return { ok: true, decision: decisionRecord, outcome: 'deferred' }
}

async function getNomineeForNomination(nomineeId: string) {
  const { getEmployeeById } = await import('@/modules/employees/service')
  return getEmployeeById(nomineeId)
}

async function patchNomination(
  id: string,
  patch: Partial<NominationRecord>
): Promise<void> {
  if (useMock()) {
    updateNominationMock(id, patch)
    return
  }
  const { id: _omit, created_at: _omit2, ...writable } = patch
  await db.nomination.update({ where: { id }, data: writable as never })
}

// ─── Recuse (spec §7.5 conflict of interest) ─────────────────────────────────

export async function recuseCommitteeMember(
  input: RecuseInput
): Promise<RecuseResult> {
  const nom = useMock()
    ? findNominationByIdMock(input.nomination_id)
    : ((await db.nomination.findUnique({
        where: { id: input.nomination_id },
      })) as unknown as NominationRecord | null)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.current_tier !== 3 || nom.status !== 'under_review') {
    return { ok: false, error: { code: 'wrong_status' } }
  }
  const authorized = await isCommitteeMember(input.actor_id)
  if (!authorized) return { ok: false, error: { code: 'forbidden' } }

  const actions = await listApprovalActions(nom.id)
  if (actions.some((a) => a.action === 'recuse' && a.actor_id === input.actor_id)) {
    return { ok: false, error: { code: 'already_recused' } }
  }

  await recordAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: 'recuse',
  })
  return { ok: true }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface HydratedTier3 {
  nomination: NominationRecord
  nominator: Employee | null
  nominee: Employee | null
  viewer_conflict: boolean
  viewer_recused: boolean
  prior_decisions: CommitteeDecisionRecord[]
  actions: ApprovalActionRecord[]
}

export async function listCommitteeQueue(
  viewerEmployeeId: string
): Promise<HydratedTier3[]> {
  const rows = useMock()
    ? listAllNominationsMock()
        .filter((n) => n.current_tier === 3 && n.status === 'under_review')
        .sort((a, b) => {
          if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
          return a.submitted_at.getTime() - b.submitted_at.getTime()
        })
    : ((await db.nomination.findMany({
        where: { current_tier: 3, status: 'under_review' },
        orderBy: [{ urgent: 'desc' }, { submitted_at: 'asc' }],
      })) as unknown as NominationRecord[])

  if (rows.length === 0) return []

  // Batch-load everything up front. For conflict detection we also need the
  // nominees' direct and skip-level managers, so resolve chain heads first
  // then widen the employee fetch.
  const nominationIds: string[] = []
  const initialEmpIds = new Set<string>([viewerEmployeeId])
  for (const n of rows) {
    nominationIds.push(n.id)
    initialEmpIds.add(n.nominator_id)
    initialEmpIds.add(n.nominee_id)
  }

  const firstPass = await getEmployeesByIds([...initialEmpIds])
  const managerIds = new Set<string>()
  for (const n of rows) {
    const nominee = firstPass.get(n.nominee_id)
    if (nominee?.manager_id) managerIds.add(nominee.manager_id)
  }
  const managers = managerIds.size
    ? await getEmployeesByIds([...managerIds])
    : new Map<string, Employee>()
  const skipIds = new Set<string>()
  for (const m of managers.values()) {
    if (m.manager_id) skipIds.add(m.manager_id)
  }
  const skips = skipIds.size
    ? await getEmployeesByIds([...skipIds])
    : new Map<string, Employee>()

  // Merge all three passes into one lookup map for the in-memory conflict walk.
  const employees = new Map<string, Employee>()
  for (const [k, v] of firstPass) employees.set(k, v)
  for (const [k, v] of managers) employees.set(k, v)
  for (const [k, v] of skips) employees.set(k, v)

  const [actionsByNom, decisionsByNom] = await Promise.all([
    listApprovalActionsForNominations(nominationIds),
    listCommitteeDecisionsForNominations(nominationIds),
  ])

  return rows.map((nomination) => {
    const actions = actionsByNom.get(nomination.id) ?? []
    return {
      nomination,
      nominator: employees.get(nomination.nominator_id) ?? null,
      nominee: employees.get(nomination.nominee_id) ?? null,
      actions,
      viewer_conflict: hasTier3ConflictFromMap(
        viewerEmployeeId,
        nomination.nominee_id,
        employees
      ),
      viewer_recused: actions.some(
        (a) => a.action === 'recuse' && a.actor_id === viewerEmployeeId
      ),
      prior_decisions: decisionsByNom.get(nomination.id) ?? [],
    }
  })
}

async function listCommitteeDecisionsForNominations(
  nomination_ids: string[]
): Promise<Map<string, CommitteeDecisionRecord[]>> {
  const out = new Map<string, CommitteeDecisionRecord[]>()
  if (nomination_ids.length === 0) return out
  const unique = Array.from(new Set(nomination_ids))
  if (useMock()) {
    for (const id of unique) out.set(id, listMockDecisionsForNomination(id))
    return out
  }
  const rows = (await db.committeeDecision.findMany({
    where: { nomination_id: { in: unique } },
    orderBy: { decided_at: 'asc' },
  })) as unknown as CommitteeDecisionRecord[]
  for (const id of unique) out.set(id, [])
  for (const row of rows) {
    if (!row.nomination_id) continue
    const bucket = out.get(row.nomination_id)
    if (bucket) bucket.push(row)
  }
  return out
}

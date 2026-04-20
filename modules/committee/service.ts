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

  const now = new Date()
  const members = input.concurring_member_ids?.length
    ? Array.from(new Set([input.actor_id, ...input.concurring_member_ids]))
    : [input.actor_id]

  const conflictedMembers = actions
    .filter((a) => a.action === 'recuse')
    .map((a) => a.actor_id)

  const decisionRecord: CommitteeDecisionRecord = {
    id: `cdec_${randomUUID()}`,
    nomination_id: nom.id,
    team_award_group_id: null,
    committee_members: members,
    decision: input.decision,
    approved_amount_usd: null,
    reward_form: null,
    delivery_plan: null,
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
  if (input.decision === 'approve') {
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

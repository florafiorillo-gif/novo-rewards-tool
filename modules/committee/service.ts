import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  findByIdMock as findNominationByIdMock,
  listAllMock as listAllNominationsMock,
  updateMock as updateNominationMock,
} from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import { getEmployeeById } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import {
  hasTier3Conflict,
  isCommitteeMember,
} from '@/modules/roles/service'
import { listApprovalActions, recordAction } from '@/modules/approvals/service'
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

  return Promise.all(
    rows.map(async (nomination) => {
      const [nominator, nominee, actions, conflict, priorDecisions] =
        await Promise.all([
          getEmployeeById(nomination.nominator_id),
          getEmployeeById(nomination.nominee_id),
          listApprovalActions(nomination.id),
          hasTier3Conflict(viewerEmployeeId, nomination.nominee_id),
          listCommitteeDecisionsForNomination(nomination.id),
        ])
      const viewerRecused = actions.some(
        (a) => a.action === 'recuse' && a.actor_id === viewerEmployeeId
      )
      return {
        nomination,
        nominator,
        nominee,
        actions,
        viewer_conflict: conflict,
        viewer_recused: viewerRecused,
        prior_decisions: priorDecisions,
      }
    })
  )
}

async function listCommitteeDecisionsForNomination(
  nomination_id: string
): Promise<CommitteeDecisionRecord[]> {
  if (useMock()) return listMockDecisionsForNomination(nomination_id)
  const rows = await db.committeeDecision.findMany({
    where: { nomination_id },
    orderBy: { decided_at: 'asc' },
  })
  return rows as unknown as CommitteeDecisionRecord[]
}

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  findByIdMock,
  updateMock,
} from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import { getEmployeeById } from '@/modules/employees/service'
import {
  pickAndChargePeopleTeamRep,
  resolveDepartmentHead,
} from '@/modules/roles/service'
import type {
  ApprovalActionRecord,
  ApprovalActionType,
  ApproveInput,
  ApproveResult,
  DenyInput,
  DenyResult,
  ProposeUpgradeInput,
  ProposeUpgradeResult,
  ReflectionType,
  RequestInfoInput,
  RequestInfoResult,
  UndoInput,
  UndoResult,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Exported so Phase 3 route handlers can dial this per spec §13.3.
export const UNDO_WINDOW_MS = 10 * 60 * 1000

// ─── Mock action store ───────────────────────────────────────────────────────
// Phase 2 exported a small recordAction + listMockApprovalActions. Phase 3
// replaces those with a fuller set. Keep the reset helper for tests.

const mockActions = new Map<string, ApprovalActionRecord>()

export function resetMockApprovalActions(): void {
  mockActions.clear()
}

export function listMockApprovalActions(
  nomination_id: string
): ApprovalActionRecord[] {
  return [...mockActions.values()]
    .filter((a) => a.nomination_id === nomination_id)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
}

async function writeAction(
  input: Omit<ApprovalActionRecord, 'id' | 'created_at'>
): Promise<ApprovalActionRecord> {
  if (useMock()) {
    const record: ApprovalActionRecord = {
      ...input,
      id: `act_${randomUUID()}`,
      created_at: new Date(),
    }
    mockActions.set(record.id, record)
    return record
  }
  const created = await db.approvalAction.create({
    data: {
      nomination_id: input.nomination_id,
      actor_id: input.actor_id,
      action: input.action,
      from_tier: input.from_tier ?? undefined,
      to_tier: input.to_tier ?? undefined,
      reason_structured: input.reason_structured ?? undefined,
      reason_text: input.reason_text ?? undefined,
      reflection_type: input.reflection_type ?? undefined,
    },
  })
  return created as unknown as ApprovalActionRecord
}

async function listActions(
  nomination_id: string
): Promise<ApprovalActionRecord[]> {
  if (useMock()) return listMockApprovalActions(nomination_id)
  const rows = await db.approvalAction.findMany({
    where: { nomination_id },
    orderBy: { created_at: 'asc' },
  })
  return rows as unknown as ApprovalActionRecord[]
}

export async function listApprovalActions(
  nomination_id: string
): Promise<ApprovalActionRecord[]> {
  return listActions(nomination_id)
}

// Bulk counterpart — returns a Map nomination_id → actions[], used by
// queue hydration so we issue one query per page rather than one per row.
export async function listApprovalActionsForNominations(
  nomination_ids: string[]
): Promise<Map<string, ApprovalActionRecord[]>> {
  const unique = Array.from(new Set(nomination_ids))
  const out = new Map<string, ApprovalActionRecord[]>()
  if (unique.length === 0) return out
  if (useMock()) {
    for (const id of unique) out.set(id, listMockApprovalActions(id))
    return out
  }
  const rows = (await db.approvalAction.findMany({
    where: { nomination_id: { in: unique } },
    orderBy: { created_at: 'asc' },
  })) as unknown as ApprovalActionRecord[]
  for (const id of unique) out.set(id, [])
  for (const row of rows) {
    const bucket = out.get(row.nomination_id)
    if (bucket) bucket.push(row)
  }
  return out
}

// ─── Nomination read + patch (bridge between mock store and Prisma) ──────────

async function loadNomination(id: string): Promise<NominationRecord | null> {
  if (useMock()) return findByIdMock(id)
  const row = await db.nomination.findUnique({ where: { id } })
  return row as unknown as NominationRecord | null
}

async function patchNomination(
  id: string,
  patch: Partial<NominationRecord>
): Promise<NominationRecord> {
  if (useMock()) {
    const updated = updateMock(id, patch)
    if (!updated) throw new Error(`patchNomination: ${id} not found`)
    return updated
  }
  const { id: _omit, created_at: _omit2, ...writable } = patch
  const updated = await db.nomination.update({
    where: { id },
    data: writable as never,
  })
  return updated as unknown as NominationRecord
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export async function approveNomination(
  input: ApproveInput
): Promise<ApproveResult> {
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.status !== 'submitted' && nom.status !== 'under_review') {
    return { ok: false, error: { code: 'wrong_status' } }
  }

  const isSelfApproval =
    nom.current_tier === 1 && input.actor_id === nom.nominator_id

  if (isSelfApproval) {
    if (!input.reflection_type) {
      return { ok: false, error: { code: 'reflection_required' } }
    }
  } else if (input.reflection_type) {
    return { ok: false, error: { code: 'reflection_not_allowed' } }
  }

  const authorized = await isActorAuthorizedToApprove(nom, input.actor_id)
  if (!authorized) return { ok: false, error: { code: 'forbidden' } }

  const now = new Date()

  // ── Tier 1 ────────────────────────────────────────────────────────────────
  if (nom.current_tier === 1) {
    const action = await writeAction({
      nomination_id: nom.id,
      actor_id: input.actor_id,
      action: 'approve',
      from_tier: null,
      to_tier: null,
      reason_structured: null,
      reason_text: null,
      reflection_type: input.reflection_type ?? null,
    })
    const updated = await patchNomination(nom.id, {
      status: 'approved',
      approved_at: now,
    })
    return { ok: true, nomination: updated, action, became_final: true }
  }

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  if (nom.current_tier === 2) {
    const action = await writeAction({
      nomination_id: nom.id,
      actor_id: input.actor_id,
      action: 'approve',
      from_tier: null,
      to_tier: null,
      reason_structured: null,
      reason_text: null,
      reflection_type: null,
    })
    const bothApproved = await isTier2FullyApproved(nom)
    if (bothApproved) {
      const updated = await patchNomination(nom.id, {
        status: 'approved',
        approved_at: now,
        current_approver_id: null,
      })
      return { ok: true, nomination: updated, action, became_final: true }
    }
    // Keep under_review; current_approver_id stays null (either snapshot
    // approver can act; the queue views filter on snapshot columns).
    return { ok: true, nomination: nom, action, became_final: false }
  }

  // ── Tier 3 ────────────────────────────────────────────────────────────────
  const action = await writeAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: 'approve',
    from_tier: null,
    to_tier: null,
    reason_structured: null,
    reason_text: null,
    reflection_type: null,
  })
  const updated = await patchNomination(nom.id, {
    status: 'approved',
    approved_at: now,
    current_approver_id: null,
  })
  return { ok: true, nomination: updated, action, became_final: true }
}

async function isActorAuthorizedToApprove(
  nom: NominationRecord,
  actorId: string
): Promise<boolean> {
  if (nom.current_tier === 1) {
    return nom.current_approver_id === actorId
  }
  if (nom.current_tier === 2) {
    return (
      actorId === nom.tier2_dept_head_id ||
      actorId === nom.tier2_people_team_rep_id
    )
  }
  // Tier 3: actor must be a committee member who hasn't recused (recusal
  // enforced by the queue UI + recuse action). Cheap check here.
  const actor = await getEmployeeById(actorId)
  return actor?.is_committee_member === true
}

async function isTier2FullyApproved(nom: NominationRecord): Promise<boolean> {
  if (!nom.tier2_dept_head_id || !nom.tier2_people_team_rep_id) return false
  const actions = await listActions(nom.id)
  // Only count approve actions that match the snapshot approvers AND were
  // logged at the current tier (from_tier null means "at whatever tier the
  // nomination was at the time"). We filter by actor + action only; later
  // tier transitions don't create stale approves because deny/drop paths
  // change the snapshot or the tier.
  const approvers = new Set(
    actions.filter((a) => a.action === 'approve').map((a) => a.actor_id)
  )
  return (
    approvers.has(nom.tier2_dept_head_id) &&
    approvers.has(nom.tier2_people_team_rep_id)
  )
}

// ─── Deny ────────────────────────────────────────────────────────────────────

export async function denyNomination(input: DenyInput): Promise<DenyResult> {
  if (!input.reason_text?.trim()) {
    return { ok: false, error: { code: 'reason_text_required' } }
  }
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.status !== 'submitted' && nom.status !== 'under_review') {
    return { ok: false, error: { code: 'wrong_status' } }
  }

  const authorized = await isActorAuthorizedToApprove(nom, input.actor_id)
  if (!authorized) return { ok: false, error: { code: 'forbidden' } }

  const now = new Date()

  // Tier 1 deny → terminal denied.
  if (nom.current_tier === 1) {
    const action = await writeAction({
      nomination_id: nom.id,
      actor_id: input.actor_id,
      action: 'deny',
      from_tier: null,
      to_tier: null,
      reason_structured: input.reason_structured,
      reason_text: input.reason_text,
      reflection_type: null,
    })
    const updated = await patchNomination(nom.id, {
      status: 'denied',
      denied_at: now,
      current_approver_id: null,
    })
    return { ok: true, nomination: updated, action, outcome: 'denied' }
  }

  // Tier 2 deny → returns to Tier 1 per spec §7.4. Snapshot approvers cleared.
  // The nominee's manager (original Tier 1 approver) gets the queue back.
  if (nom.current_tier === 2) {
    const action = await writeAction({
      nomination_id: nom.id,
      actor_id: input.actor_id,
      action: 'deny',
      from_tier: 2,
      to_tier: 1,
      reason_structured: input.reason_structured,
      reason_text: input.reason_text,
      reflection_type: null,
    })
    const nominee = await getEmployeeById(nom.nominee_id)
    const newApprover = nominee?.manager_id ?? null
    const updated = await patchNomination(nom.id, {
      current_tier: 1,
      status: 'submitted',
      current_approver_id: newApprover,
      tier2_dept_head_id: null,
      tier2_people_team_rep_id: null,
    })
    return {
      ok: true,
      nomination: updated,
      action,
      outcome: 'returned_to_tier_1',
    }
  }

  // Tier 3 deny → drops back to Tier 2 per spec §7.5.
  const action = await writeAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: 'deny',
    from_tier: 3,
    to_tier: 2,
    reason_structured: input.reason_structured,
    reason_text: input.reason_text,
    reflection_type: null,
  })
  const updated = await patchNomination(nom.id, {
    current_tier: 2,
    status: 'under_review',
    urgent: false,
  })
  return {
    ok: true,
    nomination: updated,
    action,
    outcome: 'returned_to_tier_2',
  }
}

// ─── Propose upgrade / escalate ──────────────────────────────────────────────

export async function proposeUpgrade(
  input: ProposeUpgradeInput
): Promise<ProposeUpgradeResult> {
  if (!input.reasoning?.trim()) {
    return { ok: false, error: { code: 'reasoning_required' } }
  }
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.status !== 'submitted' && nom.status !== 'under_review') {
    return { ok: false, error: { code: 'wrong_status' } }
  }

  // Valid transitions: 1 → 2, 1 → 3, 2 → 3. Not 3 → anything.
  const from = nom.current_tier
  if (input.to_tier <= from) {
    return { ok: false, error: { code: 'invalid_tier_transition' } }
  }
  if (from === 3) {
    return { ok: false, error: { code: 'invalid_tier_transition' } }
  }

  // Authorization: at Tier 1, only the current approver can propose. At
  // Tier 2, either of the snapshot approvers can escalate to Tier 3.
  if (from === 1 && nom.current_approver_id !== input.actor_id) {
    return { ok: false, error: { code: 'forbidden' } }
  }
  if (
    from === 2 &&
    input.actor_id !== nom.tier2_dept_head_id &&
    input.actor_id !== nom.tier2_people_team_rep_id
  ) {
    return { ok: false, error: { code: 'forbidden' } }
  }

  // Tier 2 target: snapshot both approvers now.
  if (input.to_tier === 2) {
    const nominee = await getEmployeeById(nom.nominee_id)
    if (!nominee) return { ok: false, error: { code: 'not_found' } }
    const deptHead = await resolveDepartmentHead(nominee)
    if (!deptHead) return { ok: false, error: { code: 'no_department_head' } }
    const rep = await pickAndChargePeopleTeamRep(input.actor_id)
    if (!rep) return { ok: false, error: { code: 'no_people_team_rep' } }

    const action = await writeAction({
      nomination_id: nom.id,
      actor_id: input.actor_id,
      action: 'propose_upgrade',
      from_tier: from,
      to_tier: 2,
      reason_structured: null,
      reason_text: input.reasoning,
      reflection_type: null,
    })
    const updated = await patchNomination(nom.id, {
      current_tier: 2,
      status: 'under_review',
      current_approver_id: null,
      tier2_dept_head_id: deptHead.id,
      tier2_people_team_rep_id: rep.id,
    })
    return { ok: true, nomination: updated, action }
  }

  // Tier 3 target: enter committee queue.
  const action = await writeAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: from === 2 ? 'escalate' : 'propose_upgrade',
    from_tier: from,
    to_tier: 3,
    reason_structured: null,
    reason_text: input.reasoning,
    reflection_type: null,
  })
  const updated = await patchNomination(nom.id, {
    current_tier: 3,
    status: 'under_review',
    current_approver_id: null,
    urgent: input.urgent === true,
  })
  return { ok: true, nomination: updated, action }
}

// ─── Undo (10-min window, Tier 1 only per spec §13.3) ────────────────────────

export async function undoApproval(input: UndoInput): Promise<UndoResult> {
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.status !== 'approved' || !nom.approved_at) {
    return { ok: false, error: { code: 'nothing_to_undo' } }
  }

  const now = input.now ?? new Date()
  if (now.getTime() - nom.approved_at.getTime() > UNDO_WINDOW_MS) {
    return { ok: false, error: { code: 'window_expired' } }
  }

  // Only the last approver can undo (spec §13.3 implies the acting approver).
  const actions = await listActions(nom.id)
  const lastApprove = [...actions].reverse().find((a) => a.action === 'approve')
  if (!lastApprove || lastApprove.actor_id !== input.actor_id) {
    return { ok: false, error: { code: 'forbidden' } }
  }

  const action = await writeAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: 'undo',
    from_tier: null,
    to_tier: null,
    reason_structured: null,
    reason_text: null,
    reflection_type: null,
  })
  const updated = await patchNomination(nom.id, {
    status: 'submitted',
    approved_at: null,
    current_approver_id: input.actor_id,
  })
  return { ok: true, nomination: updated, action }
}

// ─── Request more info (logs only, spec §7.1 "review and decide") ────────────

export async function requestMoreInfo(
  input: RequestInfoInput
): Promise<RequestInfoResult> {
  if (!input.question?.trim()) {
    return { ok: false, error: { code: 'question_required' } }
  }
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.status !== 'submitted' && nom.status !== 'under_review') {
    return { ok: false, error: { code: 'wrong_status' } }
  }
  const authorized = await isActorAuthorizedToApprove(nom, input.actor_id)
  if (!authorized) return { ok: false, error: { code: 'forbidden' } }

  const action = await writeAction({
    nomination_id: nom.id,
    actor_id: input.actor_id,
    action: 'request_info',
    from_tier: null,
    to_tier: null,
    reason_structured: null,
    reason_text: input.question,
    reflection_type: null,
  })
  return { ok: true, action }
}

// ─── Legacy recordAction entry point (Phase 2 callers) ───────────────────────

export interface RecordActionInput {
  nomination_id: string
  actor_id: string
  action: ApprovalActionType
  from_tier?: number
  to_tier?: number
  reason_structured?: import('./types').DenialReason
  reason_text?: string
  reflection_type?: ReflectionType
}

export async function recordAction(
  input: RecordActionInput
): Promise<ApprovalActionRecord> {
  return writeAction({
    nomination_id: input.nomination_id,
    actor_id: input.actor_id,
    action: input.action,
    from_tier: input.from_tier ?? null,
    to_tier: input.to_tier ?? null,
    reason_structured: input.reason_structured ?? null,
    reason_text: input.reason_text ?? null,
    reflection_type: input.reflection_type ?? null,
  })
}

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  findByIdMock,
  updateMock,
} from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import { getEmployeeById } from '@/modules/employees/service'
import type {
  ApprovalActionRecord,
  ApprovalActionType,
  DenialReason,
  ReflectionType,
} from './types'

export const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §13.3 — 10-minute undo window on Tier 1 approvals.
export const UNDO_WINDOW_MS = 10 * 60 * 1000

// ─── Mock action store ───────────────────────────────────────────────────────
// Pinned to globalThis so the Map is shared across Next.js's server-action
// and server-component webpack layers; see modules/nominations/mock-store.ts
// for the detailed rationale.

const globalForApprovalActions = globalThis as unknown as {
  __novo_approval_actions?: Map<string, ApprovalActionRecord>
}
const mockActions: Map<string, ApprovalActionRecord> =
  globalForApprovalActions.__novo_approval_actions ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForApprovalActions.__novo_approval_actions = mockActions
}

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

export async function writeAction(
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

export async function listActions(
  nomination_id: string
): Promise<ApprovalActionRecord[]> {
  if (useMock()) return listMockApprovalActions(nomination_id)
  const rows = await db.approvalAction.findMany({
    where: { nomination_id },
    orderBy: { created_at: 'asc' },
  })
  return rows as unknown as ApprovalActionRecord[]
}

// ─── Nomination read + patch (bridge between mock store and Prisma) ──────────

export async function loadNomination(id: string): Promise<NominationRecord | null> {
  if (useMock()) return findByIdMock(id)
  const row = await db.nomination.findUnique({ where: { id } })
  return row as unknown as NominationRecord | null
}

export async function patchNomination(
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

// ─── Authorization + state helpers ───────────────────────────────────────────

export async function isActorAuthorizedToApprove(
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
  const actor = await getEmployeeById(actorId)
  return actor?.is_committee_member === true
}

// Returns true when both snapshot approvers (dept head + People team rep)
// have logged an `approve` action. Used by the Tier 2 approve path to
// decide whether the current call flips status to approved.
export async function isTier2FullyApproved(
  nom: NominationRecord
): Promise<boolean> {
  if (!nom.tier2_dept_head_id || !nom.tier2_people_team_rep_id) return false
  const actions = await listActions(nom.id)
  const approvers = new Set(
    actions.filter((a) => a.action === 'approve').map((a) => a.actor_id)
  )
  return (
    approvers.has(nom.tier2_dept_head_id) &&
    approvers.has(nom.tier2_people_team_rep_id)
  )
}

// Defense-in-depth for Tier 2: the UI hides the Approve button after a
// given approver signs, but a double-click or any programmatic caller
// would still reach the service. `isTier2FullyApproved` treats the
// approver set as a Set so state stays correct, but the audit trail
// would accumulate duplicate `approve` rows from the same actor. Block
// the second call here. (Audit I3 / TODO.md pre-launch must-fix.)
export async function hasActorAlreadyApprovedAtCurrentTier(
  nom: NominationRecord,
  actorId: string
): Promise<boolean> {
  const actions = await listActions(nom.id)
  return actions.some((a) => a.action === 'approve' && a.actor_id === actorId)
}

// ─── Record-action convenience ───────────────────────────────────────────────
// Used by callers that don't need the approve/deny/upgrade state machines,
// namely committee/service.ts (mirroring CommitteeDecision into the audit
// trail) and approvals/sla.ts (system actor for auto-deny + escalate).

export interface RecordActionInput {
  nomination_id: string
  actor_id: string
  action: ApprovalActionType
  from_tier?: number
  to_tier?: number
  reason_structured?: DenialReason
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

// Public re-exports for consumers that were using these via service.ts.
export async function listApprovalActions(
  nomination_id: string
): Promise<ApprovalActionRecord[]> {
  return listActions(nomination_id)
}

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

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'

// Phase 2 skeleton. Phase 3 wires real approval logic through this surface so the
// Slack + web approval handlers never touch Prisma directly. The data model matches
// ApprovalAction in prisma/schema.prisma (spec §12.6).

export type ApprovalActionType =
  | 'approve'
  | 'deny'
  | 'propose_upgrade'
  | 'escalate'
  | 'request_info'
  | 'recuse'
  | 'group_into_team_award'
  | 'undo'

export type DenialReason =
  | 'failed_loophole'
  | 'value_mismatch'
  | 'already_recognized'
  | 'insufficient_detail'
  | 'other'

export interface ApprovalActionRecord {
  id: string
  nomination_id: string
  actor_id: string
  action: ApprovalActionType
  from_tier: number | null
  to_tier: number | null
  reason_structured: DenialReason | null
  reason_text: string | null
  created_at: Date
}

export interface RecordActionInput {
  nomination_id: string
  actor_id: string
  action: ApprovalActionType
  from_tier?: number
  to_tier?: number
  reason_structured?: DenialReason
  reason_text?: string
}

const useMock = () => process.env.USE_MOCK_DATA === 'true'
const mockActions = new Map<string, ApprovalActionRecord>()

export function resetMockApprovalActions(): void {
  mockActions.clear()
}

export function listMockApprovalActions(nomination_id: string): ApprovalActionRecord[] {
  return [...mockActions.values()]
    .filter((a) => a.nomination_id === nomination_id)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
}

export async function recordAction(input: RecordActionInput): Promise<ApprovalActionRecord> {
  if (useMock()) {
    const record: ApprovalActionRecord = {
      id: `act_${randomUUID()}`,
      nomination_id: input.nomination_id,
      actor_id: input.actor_id,
      action: input.action,
      from_tier: input.from_tier ?? null,
      to_tier: input.to_tier ?? null,
      reason_structured: input.reason_structured ?? null,
      reason_text: input.reason_text ?? null,
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
      from_tier: input.from_tier,
      to_tier: input.to_tier,
      reason_structured: input.reason_structured,
      reason_text: input.reason_text,
    },
  })
  return created as ApprovalActionRecord
}

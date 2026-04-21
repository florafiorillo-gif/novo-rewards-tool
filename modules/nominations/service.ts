import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getEmployeeById } from '@/modules/employees/service'
import { VALUE_IDS } from '@/modules/values/constants'
import { NominationInputSchema, type NominationInput } from './schema'
import * as mockStore from './mock-store'
import type {
  CancelNominationResult,
  CreateNominationResult,
  NominationRecord,
  RoutingResult,
} from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // spec §13.2
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000 // spec §6.3, §13.2

// ─── Routing ─────────────────────────────────────────────────────────────────
// Spec §6.3:
//   - nominator is nominee's manager → routes to self (self-approval flow, Phase 3)
//   - peer / skip-level                → routes to nominee's manager
//   - nominee has no manager           → People team queue (current_approver_id = null)

export function resolveRouting(
  nominator_id: string,
  nominee: { id: string; manager_id: string | null }
): RoutingResult {
  if (!nominee.manager_id) {
    return { current_approver_id: null, requires_people_team_assignment: true }
  }
  if (nominee.manager_id === nominator_id) {
    return { current_approver_id: nominator_id, requires_people_team_assignment: false }
  }
  return { current_approver_id: nominee.manager_id, requires_people_team_assignment: false }
}

// ─── Duplicate detection (signal only) ───────────────────────────────────────
// Phase 2 stores a link; Phase 6 surfaces it as a "maybe add a corroborating comment"
// prompt. Never blocks submission.

export async function findRecentDuplicate(
  nominator_id: string,
  nominee_id: string,
  now: Date = new Date()
): Promise<NominationRecord | null> {
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS)
  if (useMock()) {
    return mockStore.findMostRecentPairSinceMock(nominator_id, nominee_id, since)
  }
  const row = await db.nomination.findFirst({
    where: {
      nominator_id,
      nominee_id,
      submitted_at: { gte: since },
    },
    orderBy: { submitted_at: 'desc' },
  })
  return row as NominationRecord | null
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createNomination(
  raw: unknown,
  nominator_id: string
): Promise<CreateNominationResult> {
  const parsed = NominationInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: { code: 'validation', issues: parsed.error.issues } }
  }
  const input: NominationInput = parsed.data

  // Self-nomination blocked at submission (spec §13.2).
  if (input.nominee_id === nominator_id) {
    return { ok: false, error: { code: 'self_nomination' } }
  }

  if (!VALUE_IDS.has(input.value_id)) {
    return { ok: false, error: { code: 'value_not_found' } }
  }

  const [nominator, nominee] = await Promise.all([
    getEmployeeById(nominator_id),
    getEmployeeById(input.nominee_id),
  ])
  if (!nominator) return { ok: false, error: { code: 'nominator_not_found' } }
  if (!nominee) return { ok: false, error: { code: 'nominee_not_found' } }
  if (!nominee.active) return { ok: false, error: { code: 'nominee_inactive' } }

  const routing = resolveRouting(nominator_id, {
    id: nominee.id,
    manager_id: nominee.manager_id,
  })
  const duplicate = await findRecentDuplicate(nominator_id, nominee.id)

  const now = new Date()
  const id = useMock() ? `nom_${randomUUID()}` : undefined

  const record: NominationRecord = {
    id: id ?? '',
    nominator_id,
    nominee_id: nominee.id,
    value_id: input.value_id,
    behavior_text: input.behavior_text,
    outcome_text: input.outcome_text,
    evidence_links: input.evidence_links ?? [],
    submitted_at: now,
    current_tier: 1,
    status: 'submitted',
    current_approver_id: routing.current_approver_id,
    duplicate_of_id: duplicate?.id ?? null,
    team_award_group_id: null,
    tier2_dept_head_id: null,
    tier2_people_team_rep_id: null,
    urgent: false,
    last_nudge_at: null,
    last_escalation_at: null,
    approved_at: null,
    denied_at: null,
    acknowledged_at: null,
    post_fired_at: null,
    post_message_ts: null,
    created_at: now,
    updated_at: now,
  }

  if (useMock()) {
    mockStore.insertMock(record)
    return {
      ok: true,
      nomination: record,
      routed_to_people_team: routing.requires_people_team_assignment,
      duplicate_of_id: duplicate?.id ?? null,
    }
  }

  const created = await db.nomination.create({
    data: {
      nominator_id,
      nominee_id: nominee.id,
      value_id: input.value_id,
      behavior_text: input.behavior_text,
      outcome_text: input.outcome_text,
      evidence_links: input.evidence_links ?? [],
      current_tier: 1,
      status: 'submitted',
      current_approver_id: routing.current_approver_id,
      duplicate_of_id: duplicate?.id ?? null,
    },
  })

  return {
    ok: true,
    nomination: created as NominationRecord,
    routed_to_people_team: routing.requires_people_team_assignment,
    duplicate_of_id: duplicate?.id ?? null,
  }
}

// ─── Cancel (24-hour window, spec §13.2) ─────────────────────────────────────

export async function cancelNomination(
  nomination_id: string,
  actor_employee_id: string,
  now: Date = new Date()
): Promise<CancelNominationResult> {
  const existing = useMock()
    ? mockStore.findByIdMock(nomination_id)
    : ((await db.nomination.findUnique({ where: { id: nomination_id } })) as NominationRecord | null)
  if (!existing) return { ok: false, error: { code: 'not_found' } }

  if (existing.nominator_id !== actor_employee_id) {
    return { ok: false, error: { code: 'forbidden' } }
  }
  if (existing.status !== 'submitted') {
    return { ok: false, error: { code: 'not_cancellable' } }
  }
  const elapsed = now.getTime() - existing.submitted_at.getTime()
  if (elapsed > CANCEL_WINDOW_MS) {
    return { ok: false, error: { code: 'window_expired' } }
  }

  if (useMock()) {
    const updated = mockStore.updateMock(nomination_id, { status: 'cancelled' })
    return { ok: true, nomination: updated! }
  }

  const updated = await db.nomination.update({
    where: { id: nomination_id },
    data: { status: 'cancelled' },
  })
  return { ok: true, nomination: updated as NominationRecord }
}

// ─── Reads (thin helpers used by views) ──────────────────────────────────────

export async function getNominationById(id: string): Promise<NominationRecord | null> {
  if (useMock()) return mockStore.findByIdMock(id)
  const row = await db.nomination.findUnique({ where: { id } })
  return row as NominationRecord | null
}

export async function listNominationsByNominator(
  nominator_id: string
): Promise<NominationRecord[]> {
  if (useMock()) return mockStore.listByNominatorMock(nominator_id)
  const rows = await db.nomination.findMany({
    where: { nominator_id },
    orderBy: { submitted_at: 'desc' },
  })
  return rows as NominationRecord[]
}

export async function listPendingForApprover(
  approver_id: string
): Promise<NominationRecord[]> {
  if (useMock()) return mockStore.listPendingForApproverMock(approver_id)
  const rows = await db.nomination.findMany({
    where: {
      current_approver_id: approver_id,
      status: { in: ['submitted', 'under_review'] },
    },
    orderBy: { submitted_at: 'asc' },
  })
  return rows as NominationRecord[]
}

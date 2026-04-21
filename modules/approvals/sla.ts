import { db } from '@/lib/db'
import {
  listAllMock,
  updateMock,
} from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'
import { SYSTEM_EMPLOYEE_ID } from '@/modules/employees/mock-data'
import { getEmployeeById } from '@/modules/employees/service'
import { sendNominatorDenialDM } from '@/modules/integrations/slack/notifications'
import { recordAction } from './service'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

const AUTO_DENY_REASON_TEXT =
  'No action was taken on this nomination within 21 days, so the recognition tool auto-closed it. You can resubmit with any added context you think would help.'

// Spec §7.6. Tier 3 has no SLA (committee cadence governs).
export const NUDGE_THRESHOLD_MS = 72 * 60 * 60 * 1000
export const ESCALATION_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000
export const AUTO_DENY_THRESHOLD_MS = 21 * 24 * 60 * 60 * 1000

export interface SlaRunResult {
  nudged: string[] // nomination ids
  escalated: string[]
  auto_denied: string[]
}

export async function runSlaSweep(now: Date = new Date()): Promise<SlaRunResult> {
  const pending = await loadOpenNominations()
  const out: SlaRunResult = { nudged: [], escalated: [], auto_denied: [] }

  for (const nom of pending) {
    if (nom.current_tier === 3) continue
    const age = now.getTime() - nom.submitted_at.getTime()

    // Auto-deny wins over escalate wins over nudge; check the strongest first.
    if (age >= AUTO_DENY_THRESHOLD_MS) {
      await autoDeny(nom, now)
      out.auto_denied.push(nom.id)
      continue
    }
    if (
      age >= ESCALATION_THRESHOLD_MS &&
      !nom.last_escalation_at
    ) {
      await patch(nom.id, { last_escalation_at: now })
      await recordAction({
        nomination_id: nom.id,
        actor_id: SYSTEM_EMPLOYEE_ID,
        action: 'escalate',
        reason_text: '7-day SLA escalation (spec §7.6)',
      })
      out.escalated.push(nom.id)
      continue
    }
    if (age >= NUDGE_THRESHOLD_MS && !nom.last_nudge_at) {
      await patch(nom.id, { last_nudge_at: now })
      // No ApprovalAction for nudges — it's a notification, not a decision.
      out.nudged.push(nom.id)
    }
  }

  return out
}

async function autoDeny(nom: NominationRecord, now: Date): Promise<void> {
  await patch(nom.id, {
    status: 'denied',
    denied_at: now,
    current_approver_id: null,
  })
  await recordAction({
    nomination_id: nom.id,
    actor_id: SYSTEM_EMPLOYEE_ID,
    action: 'deny',
    reason_structured: 'other',
    reason_text: 'No action taken within 21 days (spec §7.6 auto-deny)',
  })

  // Spec §7.6 — "Nominator notified." Mirrors the manual-denial DM so the
  // nominator gets a warm close rather than silence. Slack helpers no-op
  // in dev/test without SLACK_BOT_TOKEN, so this is safe to always call.
  const [nominator, nominee] = await Promise.all([
    getEmployeeById(nom.nominator_id),
    getEmployeeById(nom.nominee_id),
  ])
  if (nominator && nominee) {
    await sendNominatorDenialDM({
      nominator_email: nominator.email,
      nominee_name: nominee.name,
      approver_name: 'Novo recognition tool',
      reason_text: AUTO_DENY_REASON_TEXT,
    })
  }
}

async function loadOpenNominations(): Promise<NominationRecord[]> {
  if (useMock()) {
    return listAllMock().filter(
      (n) => n.status === 'submitted' || n.status === 'under_review'
    )
  }
  const rows = await db.nomination.findMany({
    where: { status: { in: ['submitted', 'under_review'] } },
  })
  return rows as unknown as NominationRecord[]
}

async function patch(id: string, p: Partial<NominationRecord>): Promise<void> {
  if (useMock()) {
    updateMock(id, p)
    return
  }
  const { id: _omit, created_at: _omit2, ...writable } = p
  await db.nomination.update({ where: { id }, data: writable as never })
}

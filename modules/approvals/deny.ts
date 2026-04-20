import { getEmployeeById } from '@/modules/employees/service'
import type {
  DenyInput,
  DenyResult,
} from './types'
import {
  isActorAuthorizedToApprove,
  loadNomination,
  patchNomination,
  writeAction,
} from './shared'

// Spec §7.1 (Tier 1), §7.4 (Tier 2 → returns to Tier 1), §7.5 (Tier 3 →
// drops back to Tier 2). Reason_text is always required because the
// nominator sees it verbatim in the denial DM (§9.3).

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

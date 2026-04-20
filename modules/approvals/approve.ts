import type {
  ApproveInput,
  ApproveResult,
} from './types'
import {
  isActorAuthorizedToApprove,
  isTier2FullyApproved,
  loadNomination,
  patchNomination,
  writeAction,
} from './shared'

// Spec §7.1 / §7.2 / §7.4 / §7.5. Tier-aware; the service decides which
// authorization rule applies and whether the call flips status to approved.

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
    // Keep under_review; the other snapshot approver still has to act.
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

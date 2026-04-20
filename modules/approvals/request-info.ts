import type {
  RequestInfoInput,
  RequestInfoResult,
} from './types'
import {
  isActorAuthorizedToApprove,
  loadNomination,
  writeAction,
} from './shared'

// Spec §7.1 "review and decide" → request more info.
// Logs an ApprovalAction with the question; doesn't change status.

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

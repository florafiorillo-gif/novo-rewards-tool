import type { UndoInput, UndoResult } from './types'
import {
  UNDO_WINDOW_MS,
  listActions,
  loadNomination,
  patchNomination,
  writeAction,
} from './shared'

// Spec §13.3 — 10-minute undo window. Only the approver who flipped the
// nomination to approved can undo within the window; after that the
// People team reverses manually.

export async function undoApproval(input: UndoInput): Promise<UndoResult> {
  const nom = await loadNomination(input.nomination_id)
  if (!nom) return { ok: false, error: { code: 'not_found' } }
  if (nom.status !== 'approved' || !nom.approved_at) {
    return { ok: false, error: { code: 'nothing_to_undo' } }
  }
  // Spec §13.3 — undo is Tier 1 only. Tier 2/3 reversal is a People-team
  // manual process. Audit I4 defense in depth: no UI reaches this today,
  // but a programmatic caller would otherwise slip through.
  if (nom.current_tier !== 1) {
    return { ok: false, error: { code: 'forbidden' } }
  }

  const now = input.now ?? new Date()
  if (now.getTime() - nom.approved_at.getTime() > UNDO_WINDOW_MS) {
    return { ok: false, error: { code: 'window_expired' } }
  }

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

import { getEmployeeById } from '@/modules/employees/service'
import {
  pickAndChargePeopleTeamRep,
  resolveDepartmentHead,
} from '@/modules/roles/service'
import type {
  ProposeUpgradeInput,
  ProposeUpgradeResult,
} from './types'
import {
  loadNomination,
  patchNomination,
  writeAction,
} from './shared'

// Spec §7.1 (manager proposes upgrade from Tier 1) + §7.5 (escalation
// into committee queue). Valid transitions: 1→2, 1→3, 2→3. Not 3→anything.

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
